import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { TrainingService } from './training.service';

@Controller('training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post('generate')
  @HttpCode(200)
  async generateTraining(
    @Body()
    body: {
      caloriesTarget?: number;
      goal?: string;
      intensity?: string;
      duration?: number;
      preferences?: string[];
      userId?: string;
    },
  ) {
    console.log('generate training:', body);
    const result = await this.trainingService.generateAndSave(body);
    return { code: 200, msg: 'success', data: result };
  }

  @Get('plans')
  async getPlans(@Query('userId') userId?: string) {
    const result = await this.trainingService.getTrainingPlans(userId);
    return { code: 200, msg: 'success', data: result };
  }

  @Get('plans/:id')
  async getPlan(@Param('id') id: string) {
    const result = await this.trainingService.getTrainingPlan(id);
    return { code: 200, msg: 'success', data: result };
  }

  @Put('plans/:id')
  async updatePlan(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      description?: string;
      exercises?: any;
      completed?: boolean;
    },
  ) {
    console.log('update plan:', id, body);
    const result = await this.trainingService.updateTrainingPlan(id, body);
    return { code: 200, msg: 'success', data: result };
  }

  @Delete('plans/:id')
  async deletePlan(@Param('id') id: string) {
    const result = await this.trainingService.deleteTrainingPlan(id);
    return { code: 200, msg: 'success', data: result };
  }
}