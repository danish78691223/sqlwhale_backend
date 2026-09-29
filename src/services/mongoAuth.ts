import crypto from "crypto";
import type { Request, Response } from "express";
import User from "../models/User";
import Session from "../models/Session";
import QueryHistory from "../models/QueryHistory";
import LearningProgress from "../models/LearningProgress";
import LearningActivity from "../models/LearningActivity";

export const SQLWHALE_SESSION_COOKIE = "sqlwhale_session";
const SESSION_DAYS = 30;
const SALT = "sqlwhale-mongodb-auth-v1";
function passwordHash(v:string): string { return crypto.scryptSync(v, SALT, 64).toString("hex"); }
function sessionHash = (v:string)=>crypto.createHash("sha256").update(v,"utf8").digest("hex");
function readCookie(req:Request,name:string){for(const part of (req.headers.cookie||"").split(";")){const [key,...value]=part.trim().split("=");if(key===name)return decodeURIComponent(value.join("="));}return null;}
function setCookie(res:Response,token:string,maxAge:number){res.setHeader("Set-Cookie",[`\${SQLWHALE_SESSION_COOKIE}=\${encodeURIComponent(token)}`,`Max-Age=\${maxAge}`,"Path=/","HttpOnly",process.env.NODE_ENV==="production"?"Secure":"","SameSite=Lax"].filter(Boolean).join("; "));}
export function publicUser(u:any){return u?{id:String(u._id),localUserId:u.localUserId,name:u.name,email:u.email,role:u.role,currentPlan:u.currentPlan}:null;}
export async function createAccount(name:string,email:string,password:string){
  const user = await User.create({
    localUserId: "sqlwhale_" + crypto.randomBytes(16).toString("hex"),
    name, email, passwordHash: passwordHash(password),
  });
  return user as any;
}`,name,email,passwordHash:passwordHash(password)});}
export async function authenticate(email:string,password:string){
  const u = await User.findOne({ email }).exec() as any;
  return u && u.passwordHash === passwordHash(password) ? u : null;
}).lean();return u&&u.passwordHash===passwordHash(password)?u:null;}
export async function createSession(res:Response,localUserId:string){const token=crypto.randomBytes(48).toString("base64url");await Session.create({sessionHash:sessionHash(token),localUserId,expiresAt:new Date(Date.now()+SESSION_DAYS*86400000)});await Session.deleteMany({expiresAt:{$lte:new Date()}});setCookie(res,token,SESSION_DAYS*86400);}
export async function getCurrentUser(req:Request){
  const token = readCookie(req, SQLWHALE_SESSION_COOKIE);
  if (!token) return null;
  const s = await Session.findOne({
    sessionHash: sessionHash(token), expiresAt: { $gt: new Date() }
  }).exec() as any;
  if (!s) return null;
  return await User.findOne({ localUserId: s.localUserId }).exec() as any;
}
export async function logout(req:Request,res:Response){const token=readCookie(req,SQLWHALE_SESSION_COOKIE);if(token)await Session.deleteOne({sessionHash:sessionHash(token)});setCookie(res,"",0);}
export async function saveQueryHistory(localUserId:string,payload:any){await QueryHistory.create({localUserId,...payload});}
export async function markActivity(localUserId:string){const d=new Date().toISOString().slice(0,10);await LearningActivity.updateOne({localUserId,activityDate:d},{$setOnInsert:{localUserId,activityDate:d}},{upsert:true});}
export async function listQueryHistory(localUserId:string,limit:number){return QueryHistory.find({localUserId}).sort({createdAt:-1}).limit(limit).lean();}
export async function learningDashboard(localUserId:string){
  const [h,p,a] = await Promise.all([
    QueryHistory.find({localUserId}).lean().exec(),
    LearningProgress.find({localUserId}).sort({completedAt:-1}).lean().exec(),
    LearningActivity.find({localUserId}).sort({activityDate:-1}).limit(365).lean().exec()
  ]);
  const totalQueries=h.length;
  const successfulQueries=h.filter((x:any)=>x.status==="success").length;
  const failedQueries=h.filter((x:any)=>x.status==="error").length;
  const activitySet=new Set(a.map((x:any)=>x.activityDate));
  let learningStreak=0,cursor=new Date();cursor.setUTCHours(0,0,0,0);
  while(activitySet.has(cursor.toISOString().slice(0,10))){learningStreak++;cursor.setUTCDate(cursor.getUTCDate()-1);}
  const totalConcepts=20,completedConcepts=p.length;
  return {totalQueries,successfulQueries,failedQueries,
    successRate:totalQueries?Math.round(successfulQueries/totalQueries*100):0,
    averageExecutionTimeMs:totalQueries?Math.round(h.reduce((s:number,x:any)=>s+(x.executionTimeMs||0),0)/totalQueries):0,
    totalRowsReturned:h.reduce((s:number,x:any)=>s+(x.rowsReturned||0),0),
    completedConcepts,totalConcepts,progressPercent:Math.round(completedConcepts/totalConcepts*100),
    learningStreak,lastActivity:a[0]?.activityDate||null};
}
export async function getLearningProgress(localUserId:string){return LearningProgress.find({localUserId}).sort({completedAt:-1}).lean();}
export async function completeLearningProgress(localUserId:string,sectionId:string){await LearningProgress.updateOne({localUserId,sectionId},{$setOnInsert:{localUserId,sectionId,completedAt:new Date()}},{upsert:true});return LearningProgress.findOne({localUserId,sectionId}).lean();}