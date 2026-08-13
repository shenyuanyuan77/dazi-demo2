import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FoodService } from './food.service';

// 定义文件类型接口
interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('food')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFoodImage(@UploadedFile() file: MulterFile) {
    console.log('upload file:', file?.originalname, file?.mimetype);
    if (!file) {
      return { code: 400, msg: '请上传图片文件', data: null };
    }
    const result = await this.foodService.uploadAndAnalyze(file);
    return { code: 200, msg: 'success', data: result };
  }

  @Post('confirm')
  @HttpCode(200)
  async confirmFood(
    @Body()
    body: {
      imageUrl?: string;
      fileKey?: string;
      foodName: string;
      portion: string;
      calories: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    },
  ) {
    console.log('confirm food:', body);
    const result = await this.foodService.saveCalorieRecord(body);
    return { code: 200, msg: 'success', data: result };
  }

  @Get('records')
  async getRecords(@Query('date') date?: string, @Query('userId') userId?: string) {
    const result = await this.foodService.getCalorieRecords(date, userId);
    return { code: 200, msg: 'success', data: result };
  }

  @Delete('records/:id')
  async deleteRecord(@Param('id') id: string) {
    const result = await this.foodService.deleteCalorieRecord(id);
    return { code: 200, msg: 'success', data: result };
  }
}