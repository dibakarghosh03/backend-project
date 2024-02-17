import dotenv from "dotenv";
import dbConnect from "./config/database.js";

dotenv.config({
    path:"./env"
})



dbConnect()