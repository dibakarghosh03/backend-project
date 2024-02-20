import dotenv from "dotenv";
import dbConnect from "./config/database.js";
import {app} from "./app.js"

dotenv.config({
    path:"./.env"
})


dbConnect()
.then(() => {
    app.listen(process.env.PORT || 4000, () => {
        console.log("Server started at port : ",process.env.PORT || 4000)
    })
})
.catch((err) => {
    console.log(err)
})