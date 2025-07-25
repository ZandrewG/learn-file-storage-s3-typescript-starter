import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

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

  // Prepare the Thumbnail for Uploading

  const mediaType: string = file.type;

    // Read the image data
  const imageBuffer: ArrayBuffer = await file.arrayBuffer();
  
  
    // get Video Metadata
  const videoMetaData = getVideo(cfg.db, videoId);

  const { videoUserID } = videoMetaData?.userID as { videoUserID?: string};

  if (!videoUserID) {
    throw new UserForbiddenError("Retrieved user not the video owner.");
  }

  const thumbnailInfo: Thumbnail = {
    data: imageBuffer,
    mediaType: mediaType,
  }

  videoThumbnails.set(videoId, thumbnailInfo); // Assign the thumbnail to its corresponding video.

    // Update the video metadata with the new URL
  const port: number = 8091
  const thumbnailURL: string = `http://localhost:${port}/api/thumbnails/:${videoId}`

  videoMetaData!.thumbnailURL = thumbnailURL; // I am not sure about the use of the assertion operator here. 

    // Update the database record 
  updateVideo(cfg.db, videoMetaData!);
  
  console.log(videoMetaData!)
  //**This will all work because the api/thumbnails/:videoID endpoint serves thumbnails from that global map.**//

  return respondWithJSON(200, videoMetaData!);
}
