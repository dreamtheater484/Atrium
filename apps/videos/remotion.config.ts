import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// Crisp text: render at 1080p with high-quality H.264.
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
