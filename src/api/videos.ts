import { randomBytes } from "crypto";
import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { type ApiConfig } from "../config";
import { getVideo, updateVideo } from "../db/videos";
import { s3, S3Client } from "bun";
import path from "path"
import type { BunRequest } from "bun";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const videoId = req.url.split("/").at(-1);
  if (!videoId) {
    // Parse the videoID
    throw new BadRequestError("Invalid video ID");
  }
  
  const token = getBearerToken(req.headers);       
  const userID = validateJWT(token, cfg.jwtSecret) // Authenticating the user, verifying them
  
  const videoMetaData = getVideo(cfg.db, videoId);
  const videoUserID: string = videoMetaData!.userID;
  
  if (videoUserID !== userID) {
    throw new UserForbiddenError("Retrieved user not the video owner.");
  }
  
  const requestData: FormData = await req.formData();
  const requestDataVideoFile = requestData.get("video"); // parse the uploaded video file from the form data
  
  if (!(requestDataVideoFile instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }
  
  const fileSize: Number = requestDataVideoFile!.size;
  const MAX_UPLOAD_SIZE: Number = 1 << 30; // 1GB

  if (fileSize > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail file is greater than 10 MB. Upload a smaller file.");
  }
  
  const mediaType: string = requestDataVideoFile.type;
  if (!(mediaType === "video/mp4")) {
    throw new BadRequestError("Invalid file type. Upload an mp4 file.")
  }
  
  // Temporarily place the file on disk
  const antiCacheFileName = randomBytes(32).toString("base64url")
  const fileExtension: string = mediaType.split("/")[1]; // gets the 2nd part in MIME types, the subpart is the file extension
  const diskTemporaryFilePath = `./assets/videos/${antiCacheFileName}.${fileExtension}`;

  await Bun.write(diskTemporaryFilePath, requestDataVideoFile);
  
  // Place the file from disk to S3
  const readDiskFile = Bun.file(diskTemporaryFilePath);
  
  await S3Client.write(`${antiCacheFileName}.${fileExtension}`, readDiskFile, {
    ...cfg.s3Client, // credentials, access key, secret, bucket name
    type: mediaType,
  }); // https://bun.sh/docs/api/s3#working-with-s3-files

  // Update videoURL in the metadata
    // https://<bucket-name>.s3.<region>.amazonaws.com/<key>
  const s3URL: string = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${antiCacheFileName}.${fileExtension}`
  videoMetaData!.videoURL = s3URL;

  // Update the database record 
  updateVideo(cfg.db, videoMetaData!);

  // Delete the temporary file from disk
  readDiskFile.delete();
  return respondWithJSON(200, null);
}
