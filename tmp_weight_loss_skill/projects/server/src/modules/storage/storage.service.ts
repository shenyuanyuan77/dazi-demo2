import { Injectable } from '@nestjs/common';
import { S3Storage } from 'coze-coding-dev-sdk';

@Injectable()
export class StorageService {
  private storage: S3Storage;

  constructor() {
    this.storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }

  /**
   * 上传文件到对象存储
   */
  async upload(params: {
    buffer: Buffer;
    filename: string;
    mimetype: string;
  }): Promise<string> {
    const key = await this.storage.uploadFile({
      fileContent: params.buffer,
      fileName: params.filename,
      contentType: params.mimetype,
    });
    return key;
  }

  /**
   * 获取公开访问 URL（签名 URL，有效期 1 天）
   */
  async getPublicUrl(key: string): Promise<string> {
    const url = await this.storage.generatePresignedUrl({
      key,
      expireTime: 86400,
    });
    return url;
  }

  /**
   * 获取预签名 URL（临时访问）
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const url = await this.storage.generatePresignedUrl({
      key,
      expireTime: expiresIn,
    });
    return url;
  }
}