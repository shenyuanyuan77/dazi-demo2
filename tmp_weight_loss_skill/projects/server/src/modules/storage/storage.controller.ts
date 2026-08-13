import { Controller, Post, UseInterceptors, UploadedFile, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * 上传文件到对象存储
   */
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    console.log('上传文件:', file.originalname, file.mimetype, file.buffer?.length);

    if (!file || !file.buffer) {
      return { code: 400, msg: '文件数据为空', data: null };
    }

    const fileKey = await this.storageService.upload({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    });

    const imageUrl = await this.storageService.getPublicUrl(fileKey);

    return {
      code: 200,
      msg: 'success',
      data: {
        fileKey,
        imageUrl,
        filename: file.originalname,
      },
    };
  }
}