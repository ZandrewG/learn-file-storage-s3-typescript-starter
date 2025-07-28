import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import { pathToFileURL, type BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "path"
import { randomBytes } from "crypto";
type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

// const videoThumbnails: Map<string, Thumbnail> = new Map();
// Commented out, since storing in memory is not practical due to non-persistence. 
// better to store it as a blob in a database, or better yet in a file system. 
// CH1, L6

// export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
//   const { videoId } = req.params as { videoId?: string };
//   if (!videoId) {
//     throw new BadRequestError("Invalid video ID");
//   }

//   const video = getVideo(cfg.db, videoId);
//   if (!video) {
//     throw new NotFoundError("Couldn't find video");
//   }

//   const formData: FormData = await req.formData(); // parse the form data
  
//   const file = formData.get("thumbnail");
//   if (!(file instanceof File)) {
//     throw new BadRequestError("Thumbnail file missing");
//   }

//   const imageArrayBuffer: ArrayBuffer = await file.arrayBuffer(); 
//   // const thumbnail = videoThumbnails.get(videoId);
//   // if (!thumbnail) {
//   //   throw new NotFoundError("Thumbnail not found");
//   // }
//   const mediaType: string = file.type;
//   // console.log("In Get thumbnail,", mediaType)
//   return new Response(imageArrayBuffer, {
//     headers: {
//       "Content-Type": mediaType,
//       "Cache-Control": "no-store",
//     },
//   });
// }

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  //*****TODO: implement the upload here*****//
  const formData: FormData = await req.formData(); // parse the form data
  
  const file = formData.get("thumbnail");

  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }
  
    // The File object extends the implementation of Blob, thus inheriting its properties and methods, including arrayBuffer
    // https://developer.mozilla.org/en-US/docs/Web/API/File ; https://developer.mozilla.org/en-US/docs/Web/API/Blob
    // Blob is a raw data. 

  // Check size of the uploaded thumbnail
  const MAX_UPLOAD_SIZE = 10 << 20; // 10 MB,  10*(2**20)
  const fileSize = file.size
  
  if (fileSize > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail file is greater than 10 MB. Upload a smaller file.");
  }

  //****Prepare the Thumbnail for Uploading*****

  const mediaType: string = file.type;
  if (!(mediaType === "image/jpeg" || mediaType === "image/png")) {
    throw new BadRequestError("Invalid file type. Upload a file with jpeg or png extension.")
  }

  // Read the image data, convert to a buffer-like/blob data
  const imageArrayBuffer: ArrayBuffer = await file.arrayBuffer(); 
  // const imageBuffer: Buffer = Buffer.from(imageArrayBuffer); // CH1-L6 adjustment, convert to Buffer
  // const imageBase64: string = imageBuffer.toString("base64");// CH1-L6 adjustment, but inefficient
  

  // const thumbnailDataURL: string = `data:${mediaType};base64,${imageBase64}` // CH1-L6 adjustment,
    // https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types
    // https://www.iana.org/assignments/media-types/media-types.xhtml#image
    // base64 format is safe in data URL

  const antiCacheFileName = randomBytes(32).toString("base64url")
  const fileExtension: string = mediaType.split("/")[1]; // gets the 2nd part in MIME types, the subpart is the file extension
  const filePath = path.join(cfg.assetsRoot, `${antiCacheFileName}.${fileExtension}`);
  
  await Bun.write(filePath, imageArrayBuffer); 

  //**get Video Metadata**
  const videoMetaData = getVideo(cfg.db, videoId);

  const videoUserID: string = videoMetaData!.userID;

  if (videoUserID !== userID) {
    throw new UserForbiddenError("Retrieved user not the video owner.");
  }

  //**Update the video metadata with the new URL**

  const thumbnailURL: string = `http://localhost:${cfg.port}/${filePath}` 
  // formatting error:node.path removed the double slash before the localhost, thus producing erroneous behavior

  // correct because you dont have to put localhost again since in the browser, it will go localhost:port/localhost:port/assets/....

  // const time: Number = Date.now();
  // const thumbnailDataURL: string = nodePath.join(filePath, `?v=${time}`) // versions for cache busting
  videoMetaData!.thumbnailURL = thumbnailURL; // I am not sure about the use of the assertion operator here. 
  console.log("thumbnaildataurl", videoMetaData)
  // Update the database record 
  updateVideo(cfg.db, videoMetaData!);
  
  //**This will all work because the api/thumbnails/:videoID endpoint serves thumbnails from that global map.**//

  return respondWithJSON(200, videoMetaData!);
}
