import { Injectable } from '@nestjs/common';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

// 定义消息类型
interface ContentPart {
  type: 'text' | 'image_url' | 'video_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'high' | 'low';
  };
  video_url?: {
    url: string;
    fps?: number | null;
  };
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

@Injectable()
export class AiService {
  private config: Config;

  constructor() {
    this.config = new Config();
  }

  /**
   * 创建 LLM 客户端
   */
  createClient(): LLMClient {
    return new LLMClient(this.config);
  }

  /**
   * 分析食物图片
   */
  async analyzeFoodImage(imageUrl: string): Promise<{
    foodName: string;
    portion: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    description: string;
  }> {
    const client = this.createClient();

    // 使用符合 SDK 接口的消息格式
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请分析这张食物图片，识别食物种类和估算分量。请以JSON格式返回结果，包含以下字段：foodName（食物名称）、portion（估算分量如"一碗"、"100g"）、calories（估算热量，单位千卡）、protein（蛋白质含量，单位克）、carbs（碳水化合物含量，单位克）、fat（脂肪含量，单位克）、description（简要描述）。只返回JSON，不要其他文字。',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.3,
    });

    // 解析 JSON 响应
    try {
      const content = response.content.trim();
      // 尝试提取 JSON（可能包含 markdown 代码块）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析 AI 返回的 JSON');
    } catch (error) {
      console.error('解析食物识别结果失败:', error);
      return {
        foodName: '未知食物',
        portion: '未知',
        calories: 0,
        description: '无法识别食物，请补充描述',
      };
    }
  }

  /**
   * 对话补充信息并计算热量
   */
  async chatForCalories(
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
    currentFoodInfo: {
      foodName?: string;
      portion?: string;
      imageUrl?: string;
    },
  ): Promise<{
    response: string;
    foodInfo: {
      foodName: string;
      portion: string;
      calories: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    confirmed: boolean;
  }> {
    const client = this.createClient();

    const systemPrompt = `你是一个专业的营养师助手，帮助用户计算食物热量。
当用户上传食物图片或描述食物时，你需要：
1. 确认食物种类和分量
2. 估算热量和营养成分（蛋白质、碳水、脂肪）
3. 当用户确认信息准确后，回复"CONFIRMED"表示确认

当前食物信息：${JSON.stringify(currentFoodInfo)}

请以JSON格式返回，包含：response（对话回复）、foodInfo（食物信息）、confirmed（是否已确认）。`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.5,
    });

    try {
      const content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {
        response: response.content,
        foodInfo: {
          foodName: currentFoodInfo.foodName || '未知',
          portion: currentFoodInfo.portion || '未知',
          calories: 0,
        },
        confirmed: false,
      };
    } catch (error) {
      console.error('解析对话结果失败:', error);
      return {
        response: response.content,
        foodInfo: {
          foodName: currentFoodInfo.foodName || '未知',
          portion: currentFoodInfo.portion || '未知',
          calories: 0,
        },
        confirmed: false,
      };
    }
  }

  /**
   * 生成训练计划
   */
  async generateTrainingPlan(
    params: {
      caloriesTarget?: number;
      goal?: string;
      intensity?: string;
      duration?: number;
      preferences?: string[];
    },
  ): Promise<{
    title: string;
    description: string;
    exercises: Array<{
      name: string;
      duration: number;
      intensity: string;
      caloriesBurn: number;
      instructions: string;
    }>;
    totalCaloriesBurn: number;
  }> {
    const client = this.createClient();

    const prompt = `请根据以下需求生成个性化训练计划：
- 热量目标：${params.caloriesTarget || '未指定'} 千卡/天
- 训练目标：${params.goal || '综合健身'}
- 训练强度：${params.intensity || '中等'}
- 训练时长：${params.duration || 30} 分钟
- 偏好运动：${params.preferences?.join(', ') || '无特定偏好'}

请以JSON格式返回训练计划，包含：
- title: 计划标题
- description: 计划描述
- exercises: 训练项目数组，每项包含 name（名称）、duration（时长分钟）、intensity（强度：low/medium/high）、caloriesBurn（消耗热量）、instructions（指导说明）
- totalCaloriesBurn: 总消耗热量

只返回JSON，不要其他文字。`;

    const messages: Message[] = [{ role: 'user', content: prompt }];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.7,
    });

    try {
      const content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析训练计划');
    } catch (error) {
      console.error('解析训练计划失败:', error);
      return {
        title: '基础训练计划',
        description: '适合初学者的综合训练',
        exercises: [
          {
            name: '热身运动',
            duration: 5,
            intensity: 'low',
            caloriesBurn: 30,
            instructions: '慢跑或原地踏步，逐渐提高心率',
          },
          {
            name: '力量训练',
            duration: 15,
            intensity: 'medium',
            caloriesBurn: 150,
            instructions: '俯卧撑、深蹲、平板支撑等基础动作',
          },
          {
            name: '拉伸放松',
            duration: 10,
            intensity: 'low',
            caloriesBurn: 20,
            instructions: '全身拉伸，放松肌肉',
          },
        ],
        totalCaloriesBurn: 200,
      };
    }
  }
}