import {Router,type Request,type Response} from "express";
import crypto from "crypto";
import User from "../models/User";
import PasswordResetToken from "../models/PasswordResetToken";
import Session from "../models/Session";
import TaskCompletion from "../models/TaskCompletion.js";
import Task from "../models/Task.js";
import {authenticate,completeLearningProgress,createAccount,createSession,getCurrentUser,getLearningProgress,learningDashboard,listQueryHistory,logout,publicUser} from "../services/mongoAuth";
import { adoptGuestWorkspace, clearGuestWorkspaceCookie, getGuestWorkspaceId } from "../database/workspaces";
const router=Router();
async function requireUser(req:Request,res:Response){const u=await getCurrentUser(req);if(!u){res.status(401).json({success:false,authenticated:false,error:"Authentication required."});return null;}return u;}
router.post("/signup",async(req,res)=>{const name=typeof req.body?.name==="string"?req.body.name.trim():"";const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";const password=typeof req.body?.password==="string"?req.body.password:"";if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return res.status(400).json({success:false,error:"Name, valid email and an 8+ character password are required."});try{const user=await createAccount(name,email,password);await adoptGuestWorkspace(getGuestWorkspaceId(req),user.localUserId);await createSession(res,user.localUserId);clearGuestWorkspaceCookie(res);res.status(201).json({success:true,authenticated:true,user:publicUser(user),accountType:"sqlwhale"});}catch(e:any){if(e?.code===11000)return res.status(409).json({success:false,error:"A SQLWhale account with this email already exists."});console.error(e);res.status(500).json({success:false,error:"Unable to create SQLWhale account."});}});
router.post("/login",async(req,res)=>{const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";const password=typeof req.body?.password==="string"?req.body.password:"";try{const user=await authenticate(email,password);if(!user)return res.status(401).json({success:false,error:"Invalid SQLWhale email or password."});await createSession(res,user.localUserId);res.json({success:true,authenticated:true,user:publicUser(user),accountType:"sqlwhale"});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to login to SQLWhale."});}});
router.post("/forgot-password",async(req,res)=>{
  const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({success:false,error:"Enter a valid email address."});
  try{
    const user=await User.findOne({email}).exec() as any;
    // Always return the same message to avoid revealing which emails have accounts.
    if(user){
      await PasswordResetToken.deleteMany({userId:user.localUserId});
      const token=crypto.randomBytes(32).toString("hex");
      const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
      await PasswordResetToken.create({tokenHash,userId:user.localUserId,expiresAt:new Date(Date.now()+5*60*1000)});
      const base=(process.env.FRONTEND_URL||process.env.WEB_URL||"https://webxwhale.com").replace(/\/+$/,"");
      const resetUrl=base+"/reset-password?token="+encodeURIComponent(token);
      const apiKey=process.env.RESEND_API_KEY;
      const from=process.env.RESEND_FROM_EMAIL||process.env.FROM_EMAIL;
      if(!apiKey||!from){
        await PasswordResetToken.deleteOne({tokenHash});
        console.error("Password reset email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
        return res.status(503).json({success:false,error:"Password reset email is temporarily unavailable. Please try again later."});
      }
      const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[user.email],subject:"Reset your SQLWhale password",html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#18181b"><h1>Reset your SQLWhale password</h1><p>We received a request to reset your password. This link expires in 5 minutes and can only be used once.</p><p style="margin:28px 0"><a href="${resetUrl}" style="background:#8b5cf6;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p><p style="color:#71717a;font-size:12px">For your security, do not share this link.</p></div>`})});
      if(!mail.ok){
        const details=await mail.text();
        console.error("Password reset email provider failed:",mail.status,details);
        await PasswordResetToken.deleteOne({tokenHash});
        return res.status(503).json({success:false,error:"Unable to send the reset email right now. Please try again later."});
      }
    }
    return res.json({success:true,message:"If an account exists for that email, a password reset link has been sent."});
  }catch(error){console.error("Forgot password failed:",error);return res.status(500).json({success:false,error:"Unable to process the password reset request."});}
});
router.post("/reset-password",async(req,res)=>{
  const token=typeof req.body?.token==="string"?req.body.token.trim():"";
  const password=typeof req.body?.password==="string"?req.body.password:"";
  if(!token||token.length>200)return res.status(400).json({success:false,error:"This reset link is invalid or expired. Request a new one."});
  if(password.length<8)return res.status(400).json({success:false,error:"Password must be at least 8 characters long."});
  try{
    const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
    const reset=await PasswordResetToken.findOne({tokenHash,usedAt:null,expiresAt:{$gt:new Date()}}).exec() as any;
    if(!reset)return res.status(400).json({success:false,error:"This reset link is invalid, expired, or already used. Request a new one."});
    // Claim the token before changing credentials so concurrent submissions cannot reuse it.
    const consumed=await PasswordResetToken.findOneAndUpdate({_id:reset._id,usedAt:null,expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{new:true}).exec();
    if(!consumed)return res.status(400).json({success:false,error:"This reset link has already been used. Request a new one."});
    const passwordHash=crypto.scryptSync(password,"sqlwhale-mongodb-auth-v1",64).toString("hex");
    const user=await User.findOneAndUpdate({localUserId:reset.userId},{$set:{passwordHash}},{new:true}).exec();
    if(!user)return res.status(400).json({success:false,error:"This reset link is invalid or expired. Request a new one."});
    // Password reset revokes existing sessions so the old password cannot keep a session active.
    await Session.deleteMany({localUserId:reset.userId});
    await PasswordResetToken.deleteMany({userId:reset.userId});
    return res.json({success:true,message:"Your password has been reset. You can now log in."});
  }catch(error){console.error("Reset password failed:",error);return res.status(500).json({success:false,error:"Unable to reset your password right now."});}
});
router.get("/me",async(req,res)=>{try{const u=await getCurrentUser(req);if(!u)return res.status(401).json({success:false,authenticated:false});res.json({success:true,authenticated:true,user:publicUser(u),accountType:"sqlwhale"});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to check SQLWhale session."});}});
router.get("/query-history",async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;const n=Number(req.query.limit),limit=Number.isInteger(n)?Math.min(Math.max(n,1),100):50;res.json({success:true,history:await listQueryHistory(u.localUserId,limit)});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to load query history."});}});
router.get("/task-completions",async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;const items=await TaskCompletion.find({localUserId:u.localUserId}).sort({completedAt:-1}).lean().exec();const taskIds=items.map((x:any)=>x.taskId);const tasks=await Task.find({_id:{$in:taskIds}}).lean().exec();const byId=new Map(tasks.map((t:any)=>[String(t._id),t]));res.json({success:true,completions:items.map((x:any)=>{const t=byId.get(String(x.taskId));return{id:String(x.taskId),title:t?.title||"SQL Task",difficulty:t?.difficulty||"Easy",completedAt:x.completedAt};})});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to load completed tasks."});}});
router.get("/learning-dashboard",async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;res.json({success:true,stats:await learningDashboard(u.localUserId)});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to load learning dashboard."});}});
router.get("/learning-progress",async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;res.json({success:true,progress:await getLearningProgress(u.localUserId)});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to load learning progress."});}});
router.post("/learning-progress/:sectionId",async(req,res)=>{const sectionId=typeof req.params.sectionId==="string"?req.params.sectionId.trim():"";if(!/^[a-z0-9-]+$/.test(sectionId))return res.status(400).json({success:false,error:"Invalid learning section."});try{const u=await requireUser(req,res);if(!u)return;res.json({success:true,progress:await completeLearningProgress(u.localUserId,sectionId)});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to save learning progress."});}});
router.post("/logout",async(req,res)=>{try{await logout(req,res);res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,error:"Unable to logout."});}});
export default router;