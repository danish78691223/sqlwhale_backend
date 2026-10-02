import express,{NextFunction,Request,Response} from "express";
import cors from "cors";
import dotenv from "dotenv";
import {connectMongo} from "./config/mongo";
import {initializeSchema} from "./database/schema";
import {seedDatabase} from "./database/seed";
import sqlRoutes from "./routes/sql.routes";
import tableRoutes from "./routes/table.routes";
import lessonRoutes from "./routes/lesson.routes";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import taskRoutes from "./routes/task.routes";
dotenv.config();
const app=express();const PORT=Number(process.env.PORT)||5000;
async function start(){
 try{await connectMongo();initializeSchema();seedDatabase();}catch(error){console.error("Startup initialization failed:",error);process.exit(1);}
 app.use(cors({origin:process.env.FRONTEND_URL||"http://localhost:3000",credentials:true,methods:["GET","POST","PUT","DELETE","OPTIONS"],allowedHeaders:["Content-Type","Authorization"]}));
 app.use(express.json({limit:"1mb"}));app.use(express.urlencoded({extended:true}));
 app.use((req:Request,_res:Response,next:NextFunction)=>{console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);next();});
 app.get("/api/health",(_req,res)=>res.json({success:true,message:"SQLWhale backend is running.",timestamp:new Date().toISOString()}));
 app.use("/api/sql",sqlRoutes);app.use("/api/tables",tableRoutes);app.use("/api/lessons",lessonRoutes);app.use("/api/auth",authRoutes);app.use("/api/tasks",taskRoutes);app.use("/api/admin",adminRoutes);
 app.use((_req,res)=>res.status(404).json({success:false,error:"Route not found."}));
 app.use((error:Error,_req:Request,res:Response,_next:NextFunction)=>{console.error("Unhandled Server Error:",error);res.status(500).json({success:false,error:"Internal server error."});});
 app.listen(PORT,()=>console.log(`SQLWhale backend running on port ${PORT}`));
}
void start();