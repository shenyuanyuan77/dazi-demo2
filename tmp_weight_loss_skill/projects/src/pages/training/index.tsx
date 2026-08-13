import { useState, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Dumbbell, Clock, Flame, Check, Trash2, ChevronDown, ChevronUp, Plus } from 'lucide-react-taro';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// 训练项目类型
interface Exercise {
  name: string;
  duration: number;
  intensity: string;
  caloriesBurn: number;
  instructions: string;
}

// 训练计划类型
interface TrainingPlan {
  id: string;
  title: string;
  description: string;
  exercises: Exercise[];
  total_calories_burn: number;
  calories_target?: number;
  goal?: string;
  intensity?: string;
  duration?: number;
  completed: boolean;
  created_at: string;
}

const TrainingPage = () => {
  // 状态管理
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  
  // 生成参数
  const [goal, setGoal] = useState('减脂塑形');
  const [intensity, setIntensity] = useState('中等');
  const [duration, setDuration] = useState(30);
  const [preferences, setPreferences] = useState('');

  // 加载训练计划列表
  const loadPlans = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/training/plans',
        method: 'GET',
      });
      console.log('load plans response:', res.data);
      if (res.data?.code === 200 && res.data?.data) {
        setPlans(res.data.data);
      }
    } catch (error) {
      console.error('加载训练计划失败:', error);
    }
  }, []);

  // 页面加载时获取数据
  useState(() => {
    loadPlans();
  });

  // 生成训练计划
  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setShowGenerateDialog(false);
    
    try {
      const res = await Network.request({
        url: '/api/training/generate',
        method: 'POST',
        data: {
          goal,
          intensity,
          duration,
          preferences: preferences ? preferences.split(',').map(p => p.trim()) : [],
        },
      });

      console.log('generate plan response:', res.data);
      if (res.data?.code === 200 && res.data?.data) {
        Taro.showToast({
          title: '生成成功',
          icon: 'success',
        });
        loadPlans();
      }
    } catch (error) {
      console.error('生成训练计划失败:', error);
      Taro.showToast({
        title: '生成失败',
        icon: 'none',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // 完成训练计划
  const handleCompletePlan = async (planId: string) => {
    try {
      const res = await Network.request({
        url: `/api/training/plans/${planId}`,
        method: 'PUT',
        data: { completed: true },
      });

      if (res.data?.code === 200) {
        Taro.showToast({
          title: '已完成训练',
          icon: 'success',
        });
        loadPlans();
      }
    } catch (error) {
      console.error('更新失败:', error);
      Taro.showToast({
        title: '更新失败',
        icon: 'none',
      });
    }
  };

  // 删除训练计划
  const handleDeletePlan = async (planId: string) => {
    try {
      const res = await Network.request({
        url: `/api/training/plans/${planId}`,
        method: 'DELETE',
      });

      if (res.data?.code === 200) {
        Taro.showToast({
          title: '删除成功',
          icon: 'success',
        });
        loadPlans();
      }
    } catch (error) {
      console.error('删除失败:', error);
      Taro.showToast({
        title: '删除失败',
        icon: 'none',
      });
    }
  };

  // 展开/收起计划详情
  const toggleExpand = (planId: string) => {
    setExpandedPlan(expandedPlan === planId ? null : planId);
  };

  // 强度显示颜色
  const getIntensityColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-orange-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <ScrollView className="h-full bg-gray-50" scrollY>
      <View className="p-4 pb-20">
        {/* 生成训练计划按钮 */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell size={20} color="#f97316" />
              <Text className="block text-lg">训练计划</Text>
            </CardTitle>
            <CardDescription>
              <Text className="block">基于热量需求生成个性化训练方案</Text>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
              <DialogTrigger asChild>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  disabled={isGenerating}
                >
                  <View className="flex items-center justify-center gap-2">
                    {isGenerating ? (
                      <Text className="block text-white">生成中...</Text>
                    ) : (
                      <>
                        <Plus size={18} color="#fff" />
                        <Text className="block text-white">生成训练计划</Text>
                      </>
                    )}
                  </View>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    <Text className="block">训练偏好设置</Text>
                  </DialogTitle>
                </DialogHeader>
                <View className="flex flex-col gap-4 py-4">
                  {/* 训练目标 */}
                  <View>
                    <Text className="block text-sm font-medium mb-2">训练目标</Text>
                    <View className="flex gap-2">
                      {['减脂塑形', '增肌强化', '健康维持'].map((g) => (
                        <Badge
                          key={g}
                          className={`cursor-pointer ${
                            goal === g ? 'bg-orange-500' : 'bg-gray-100'
                          }`}
                          onClick={() => setGoal(g)}
                        >
                          <Text className={goal === g ? 'text-white' : 'text-gray-700'}>
                            {g}
                          </Text>
                        </Badge>
                      ))}
                    </View>
                  </View>

                  {/* 训练强度 */}
                  <View>
                    <Text className="block text-sm font-medium mb-2">训练强度</Text>
                    <View className="flex gap-2">
                      {['低', '中等', '高'].map((i) => (
                        <Badge
                          key={i}
                          className={`cursor-pointer ${
                            intensity === i ? 'bg-orange-500' : 'bg-gray-100'
                          }`}
                          onClick={() => setIntensity(i)}
                        >
                          <Text className={intensity === i ? 'text-white' : 'text-gray-700'}>
                            {i}
                          </Text>
                        </Badge>
                      ))}
                    </View>
                  </View>

                  {/* 训练时长 */}
                  <View>
                    <Text className="block text-sm font-medium mb-2">训练时长（分钟）</Text>
                    <Input
                      type="number"
                      value={duration.toString()}
                      onInput={(e) => setDuration(parseInt(e.detail.value) || 30)}
                      className="w-full"
                    />
                  </View>

                  {/* 偏好运动 */}
                  <View>
                    <Text className="block text-sm font-medium mb-2">偏好运动（逗号分隔）</Text>
                    <Input
                      placeholder="如：跑步,瑜伽,游泳"
                      value={preferences}
                      onInput={(e) => setPreferences(e.detail.value)}
                      className="w-full"
                    />
                  </View>

                  <Button
                    onClick={handleGeneratePlan}
                    className="w-full bg-orange-500 mt-2"
                  >
                    <Text className="block text-white">开始生成</Text>
                  </Button>
                </View>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* 训练计划列表 */}
        <View className="mb-3">
          <Text className="block text-lg font-semibold text-gray-800">
            我的计划
          </Text>
        </View>

        {plans.length === 0 ? (
          <Card>
            <CardContent className="p-8">
              <View className="flex items-center justify-center">
                <Text className="block text-sm text-gray-500 text-center">
                  暂无训练计划{'\n'}点击上方按钮生成专属方案
                </Text>
              </View>
            </CardContent>
          </Card>
        ) : (
          <View className="flex flex-col gap-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`${plan.completed ? 'bg-green-50 border-green-200' : ''}`}
              >
                <CardContent className="p-4">
                  {/* 计划头部 */}
                  <View
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleExpand(plan.id)}
                  >
                    <View className="flex items-center gap-3">
                      <View className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Dumbbell size={20} color="#f97316" />
                      </View>
                      <View>
                        <Text className="block font-semibold">{plan.title}</Text>
                        <View className="flex items-center gap-2 mt-1">
                          <Badge className="bg-orange-100 text-orange-600">
                            <Flame size={12} color="#f97316" />
                            <Text className="ml-1">{plan.total_calories_burn} 千卡</Text>
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <Clock size={12} color="#666" />
                            <Text className="ml-1">{plan.duration || 30} 分钟</Text>
                          </Badge>
                        </View>
                      </View>
                    </View>
                    <View className="flex items-center gap-2">
                      {expandedPlan === plan.id ? (
                        <ChevronUp size={20} color="#666" />
                      ) : (
                        <ChevronDown size={20} color="#666" />
                      )}
                    </View>
                  </View>

                  {/* 展开详情 */}
                  {expandedPlan === plan.id && (
                    <View className="mt-4 pt-4 border-t border-gray-100">
                      <Text className="block text-sm text-gray-600 mb-3">
                        {plan.description}
                      </Text>

                      {/* 训练项目列表 */}
                      <View className="flex flex-col gap-2 mb-4">
                        {plan.exercises?.map((exercise, index) => (
                          <View
                            key={index}
                            className="flex items-center gap-3 p-2 bg-white rounded-lg"
                          >
                            <Badge className={getIntensityColor(exercise.intensity)}>
                              <Text className="text-white text-xs">
                                {exercise.intensity === 'high' ? '高' : exercise.intensity === 'medium' ? '中' : '低'}
                              </Text>
                            </Badge>
                            <View className="flex-1">
                              <Text className="block font-medium text-sm">
                                {exercise.name}
                              </Text>
                              <Text className="block text-xs text-gray-500">
                                {exercise.instructions}
                              </Text>
                            </View>
                            <View className="text-right">
                              <Text className="block text-sm font-medium">
                                {exercise.duration} 分钟
                              </Text>
                              <Text className="block text-xs text-gray-500">
                                {exercise.caloriesBurn} 千卡
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>

                      {/* 操作按钮 */}
                      <View className="flex gap-2">
                        {!plan.completed && (
                          <Button
                            size="sm"
                            onClick={() => handleCompletePlan(plan.id)}
                            className="flex-1 bg-green-500"
                          >
                            <View className="flex items-center justify-center gap-1">
                              <Check size={14} color="#fff" />
                              <Text className="text-white">完成训练</Text>
                            </View>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeletePlan(plan.id)}
                          className="flex-1"
                        >
                          <View className="flex items-center justify-center gap-1">
                            <Trash2 size={14} color="#666" />
                            <Text className="text-gray-600">删除</Text>
                          </View>
                        </Button>
                      </View>
                    </View>
                  )}
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default TrainingPage;