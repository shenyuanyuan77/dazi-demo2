import { Controller, Post, Get, Body, HttpCode } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze-food')
  @HttpCode(200)
  async analyzeFood(@Body() body: { imageUrl: string }) {
    console.log('analyze-food request:', body.imageUrl);
    const result = await this.aiService.analyzeFoodImage(body.imageUrl);
    return { code: 200, msg: 'success', data: result };
  }

  @Post('chat')
  @HttpCode(200)
  async chat(
    @Body()
    body: {
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
      currentFoodInfo: any;
    },
  ) {
    console.log('chat request:', body.userMessage);
    const result = await this.aiService.chatForCalories(
      body.conversationHistory,
      body.userMessage,
      body.currentFoodInfo,
    );
    return { code: 200, msg: 'success', data: result };
  }

  @Post('generate-training')
  @HttpCode(200)
  async generateTraining(
    @Body()
    body: {
      caloriesTarget?: number;
      goal?: string;
      intensity?: string;
      duration?: number;
      preferences?: string[];
    },
  ) {
    console.log('generate-training request:', body);
    const result = await this.aiService.generateTrainingPlan(body);
    return { code: 200, msg: 'success', data: result };
  }
}