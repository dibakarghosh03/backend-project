import {v2 as cloudinary} from 'cloudinary';
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({
    path:"../.env"
});


cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret:  process.env.CLOUDINARY_API_SECRET
});

const extractPublicId = (cloudinaryUrl) => {
    const parts = cloudinaryUrl.split('/');
    const publicIdWithExtension = parts[parts.length - 1].split('.')[0];
    const publicIdParts = publicIdWithExtension.split('_');
    return publicIdParts[0];
};

const deleteFromCloudinary = async (publicId) => {
    try {
        const response = await cloudinary.uploader.destroy(publicId);
        return response.result === 'ok';
    } catch (error) {
        console.error('Error deleting file from Cloudinary:', error);
        return false;
    }
};

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        // upload file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type: "auto"
        });
        if (!response || !response.url) {
            throw new Error('Cloudinary upload failed');
        }

        fs.unlinkSync(localFilePath); // remove the locally saved file
        return response;
    } catch (error) {
        console.log("file not found : ",error)
        fs.unlinkSync(localFilePath); // remove the locally saved file
        return null;
    }
}

export {
    uploadOnCloudinary,
    deleteFromCloudinary,
    extractPublicId
}