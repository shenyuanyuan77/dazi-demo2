import { Injectable, BadRequestException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

@Injectable()
export class TrainingService {
  constructor(private readonly aiService: AiService) {}

  /**
   * 生成并保存训练计划
   */
  async generateAndSave(params: {
    caloriesTarget?: number;
    goal?: string;
    intensity?: string;
    duration?: number;
    preferences?: string[];
    userId?: string;
  }) {
    // 1. 调用 AI 生成训练计划
    const plan = await this.aiService.generateTrainingPlan(params);

    // 2. 保存到数据库
    const supabase = getSupabaseClient();
    const result = await supabase.from('training_plans').insert({
      title: plan.title,
      description: plan.description,
      exercises: plan.exercises,
      total_calories_burn: plan.totalCaloriesBurn,
      calories_target: params.caloriesTarget,
      goal: params.goal,
      intensity: params.intensity,
      duration: params.duration,
      preferences: params.preferences,
      user_id: params.userId || 'anonymous',
    }).select().single();

    if (result.error) {
      throw new BadRequestException('保存训练计划失败: ' + result.error.message);
    }

    return {
      ...plan,
      id: result.data.id,
      createdAt: result.data.created_at,
    };
  }

  /**
   * 获取训练计划列表
   */
  async getTrainingPlans(userId?: string) {
    const supabase = getSupabaseClient();
    const result = await supabase.from('training_plans')
      .select('*')
      .eq('user_id', userId || 'anonymous')
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new BadRequestException('获取训练计划失败: ' + result.error.message);
    }

    return result.data;
  }

  /**
   * 获取单个训练计划详情
   */
  async getTrainingPlan(id: string) {
    const supabase = getSupabaseClient();
    const result = await supabase.from('training_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (result.error) {
      throw new BadRequestException('获取训练计划失败: ' + result.error.message);
    }

    return result.data;
  }

  /**
   * 更新训练计划
   */
  async updateTrainingPlan(id: string, data: {
    title?: string;
    description?: string;
    exercises?: any;
    completed?: boolean;
  }) {
    const supabase = getSupabaseClient();
    const updateData: any = {};
    if (data.title) updateData.title = data.title;
    if (data.description) updateData.description = data.description;
    if (data.exercises) updateData.exercises = data.exercises;
    if (data.completed !== undefined) updateData.completed = data.completed;

    const result = await supabase.from('training_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (result.error) {
      throw new BadRequestException('更新训练计划失败: ' + result.error.message);
    }

    return result.data;
  }

  /**
   * 删除训练计划
   */
  async deleteTrainingPlan(id: string) {
    const supabase = getSupabaseClient();
    const result = await supabase.from('training_plans')
      .delete()
      .eq('id', id);

    if (result.error) {
      throw new BadRequestException('删除训练计划失败: ' + result.error.message);
    }

    return { success: true };
  }
}