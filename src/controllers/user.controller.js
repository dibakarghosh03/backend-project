import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary, extractPublicId } from "../utils/cloudinary.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);

        if(!user){
            throw new Error("User not found")
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};
    } catch (error) {
        console.error(error);
        throw new ApiError(500,"Something went wrong while generating access and refresh token");
    }
}


const registerUser = asyncHandler( async (req,res) => {

    const {fullName, email, username, password} = req.body;
    
    if(
        [fullName,email,username,password].some((field) => (field?.trim() === ""))
    ) {
        throw new ApiError(400,"Please fill in all fields");
    }
    
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    });

    if(existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

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


const loginUser = asyncHandler(async (req,res) => {

    // get data from req.body
    const {email,username,password} = req.body;
    if(!(username || email)){
        throw new ApiError(400, "username or email is required");
    }

    // find the user
    const user = await User.findOne({
        $or: [{username},{email}]
    });

    if(!user){
        throw new ApiError(400, "User not found");
    }

    // password check
    const isPasswordValid = await user.isPasswordMatched(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Incorrect password");
    }

    // if password is correct => generate access and refresh token
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    // send cookies
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    const options = {
        httpOnly: true,
        secure: true
    };

    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(200,{
            user: loggedInUser,
            accessToken,
            refreshToken
        },
        "User logged in successfully")
    );
});


const logoutUser = asyncHandler(async(req,res) => {
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {
                refreshToken : undefined
            }
        },
        {
            new : true
        }
    );

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200,{},"User logged out"));
})


const refreshAccessToken = asyncHandler(async(req,res) => {
    const incomingRefreshToken =req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        );
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user){
            throw new ApiError(401,"Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token expired or invalid");
        }
    
        const options = {
            httpOnly: true,
            secure: true
        };
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id);
    
        return res.status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken,
                    refreshToken: newRefreshToken
                },
                "Access token refreshed successfully"
            )
        );

    } catch (error) {
        throw new ApiError(401,error.message || "Something went wrong");
    }

});


const changeCurrentPassword = asyncHandler(async(req,res) => {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);
    const isPasswordValid = await user.isPasswordMatched(oldPassword);

    if(!isPasswordValid){
        throw new ApiError(400,"Invalid password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    return res.status(200)
    .json(
        new ApiResponse(200, {}, "Password changed successfully")
    );
});


const getCurrentUser = asyncHandler(async (req,res) => {
    return res
            .status(200)
            .json(
                new ApiResponse(200,req.user,"User fetched successfully")
            );
});


const updateAccountDetails = asyncHandler(async (req,res) => {
    const {fullName,email} = req.body;

    if(!fullName || !email){
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                fullName,
                email
            }
        },
        {new: true}
    ).select("-passeord");

    return res.status(200)
    .json(
        new ApiResponse(200, user, "Account details updated successfully")
    )

});


const updateUserAvatar = asyncHandler(async (req,res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400,"File missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new ApiError(500, "Error while uploading avatar");
    }

    const user = await User.findById(req.user._id).select("-password");

    if(!user){
        throw new ApiError(404,"User not found");
    }

    const oldAvatarUrl = user.avatar;

    user.avatar = avatar.url;
    await user.save();

    if(oldAvatarUrl){
        const publicId = extractPublicId(oldAvatarUrl);
        await deleteFromCloudinary(publicId);
    }

    return res.status(200).json(
        new ApiResponse(200, user, "Avatar updated successfully")
    );
});


const updateCoverImage = asyncHandler(async (req,res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new ApiError(400,"File missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url){
        throw new ApiError(500, "Error while uploading avatar");
    }

    const user = await User.findById(req.user._id).select("-password");

    if(!user){
        throw new ApiError(404,"User not found");
    }

    const oldCoverImageUrl = user.coverImage;

    user.coverImage = coverImage.url;
    await user.save();

    if(oldCoverImageUrl){
        const publicId = extractPublicId(oldCoverImageUrl);
        await deleteFromCloudinary(publicId);
    }


    return res.status(200).json(
        new ApiResponse(200, user, "Cover Image updated successfully")
    );
});


const getUserChannelProfile = asyncHandler(async (req,res) => {
    const username = req.params;

    if(!username?.trim()){
        throw new ApiError(400,"Username is required");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ]);

    if(!channel?.length){
        throw new ApiError(404,"Channel does not exist");
    }

    return res.status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    );
});


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateCoverImage,
    getUserChannelProfile
};