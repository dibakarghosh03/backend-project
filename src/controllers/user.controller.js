import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {uploadOnCloudinary } from "../utils/cloudinary.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async (req,res) => {

    const {fullName, email, username, password} = req.body;
    
    if(
        [fullName,email,username,password].some((field) => (field?.trim() === ""))
    ) {
        throw new ApiError(400,"Please fill in all fields");
    }
    
    const existedUser = User.findOne({
        $or: [{username}, {email}]
    });

    if(existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required");
    }

    const avatarCloudinaryUrl = await uploadOnCloudinary(avatarLocalPath);
    const coverImageCloudinaryUrl = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatarCloudinaryUrl){
        throw new ApiError(500, "Failed to upload avatar");
    }

    const user = await User.create({
        fullName,
        avatar: avatarCloudinaryUrl.url,
        coverImage: coverImageCloudinaryUrl.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    
    if(!createdUser){
        throw new ApiError(500, "Failed to create user");
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    );

} );

export {registerUser};