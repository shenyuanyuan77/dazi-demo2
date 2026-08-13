import { Injectable, BadRequestException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

@Injectable()
export class FoodService {
  constructor(
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 上传食物图片并识别
   */
  async uploadAndAnalyze(file: { buffer: Buffer; originalname: string; mimetype: string }) {
    // 1. 上传图片到对象存储
    const fileKey = await this.storageService.upload({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    });

    // 2. 获取公开 URL
    const imageUrl = await this.storageService.getPublicUrl(fileKey);

    // 3. 调用 AI 分析图片
    const analysis = await this.aiService.analyzeFoodImage(imageUrl);

    return {
      imageUrl,
      fileKey,
      analysis,
    };
  }

  /**
   * 确认并保存热量记录
   */
  async saveCalorieRecord(data: {
    imageUrl?: string;
    fileKey?: string;
    foodName: string;
    portion: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    userId?: string;
  }) {
    const supabase = getSupabaseClient();
    const result = await supabase.from('calorie_records').insert({
      image_url: data.imageUrl,
      image_key: data.fileKey,
      food_name: data.foodName,
      portion: data.portion,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      user_id: data.userId || 'anonymous',
      record_date: new Date().toISOString().split('T')[0],
    }).select().single();

    if (result.error) {
      throw new BadRequestException('保存热量记录失败: ' + result.error.message);
    }

    return result.data;
  }

  /**
   * 获取热量记录（按日期）
   */
  async getCalorieRecords(date?: string, userId?: string) {
    const queryDate = date || new Date().toISOString().split('T')[0];
    const supabase = getSupabaseClient();
    
    const result = await supabase.from('calorie_records')
      .select('*')
      .eq('record_date', queryDate)
      .eq('user_id', userId || 'anonymous')
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new BadRequestException('获取热量记录失败: ' + result.error.message);
    }

    // 计算总热量
    const totalCalories = result.data?.reduce((sum, record) => sum + record.calories, 0) || 0;

    return {
      records: result.data,
      totalCalories,
    };
  }

  /**
   * 删除热量记录
   */
  async deleteCalorieRecord(id: string) {
    const supabase = getSupabaseClient();
    const result = await supabase.from('calorie_records')
      .delete()
      .eq('id', id);

    if (result.error) {
      throw new BadRequestException('删除热量记录失败: ' + result.error.message);
    }

    return { success: true };
  }
}