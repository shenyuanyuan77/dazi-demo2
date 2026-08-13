import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AiModule } from '@/modules/ai/ai.module';
import { FoodModule } from '@/modules/food/food.module';
import { TrainingModule } from '@/modules/training/training.module';
import { StorageModule } from '@/modules/storage/storage.module';

@Module({
  imports: [AiModule, StorageModule, FoodModule, TrainingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
