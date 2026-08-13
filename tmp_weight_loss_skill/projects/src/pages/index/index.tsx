import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Camera, Upload, MessageCircle, Trash2, Check, ChefHat, Flame, X } from 'lucide-react-taro';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';

// 食物信息类型
interface FoodInfo {
  foodName: string;
  portion: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  description: string;
}

// 热量记录类型
interface CalorieRecord {
  id: string;
  food_name: string;
  portion: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  image_url?: string;
  created_at: string;
}

// 对话消息类型
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const IndexPage = () => {
  // 状态管理
  const [todayCalories, setTodayCalories] = useState(0);
  const [calorieGoal] = useState(2000); // 默认目标2000千卡
  const [records, setRecords] = useState<CalorieRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFood, setCurrentFood] = useState<FoodInfo | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const conversationHistory = useRef<ChatMessage[]>([]);

  // 加载今日热量记录
  const loadTodayRecords = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/food/records',
        method: 'GET',
      });
      console.log('load records response:', res.data);
      if (res.data?.code === 200 && res.data?.data) {
        setRecords(res.data.data.records || []);
        setTodayCalories(res.data.data.totalCalories || 0);
      }
    } catch (error) {
      console.error('加载记录失败:', error);
    }
  }, []);

  // 页面加载时获取数据
  useState(() => {
    loadTodayRecords();
  });

  // 选择并上传图片
  const handleChooseImage = async () => {
    try {
      const chooseResult = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });

      const tempFilePath = chooseResult.tempFilePaths[0];
      setIsUploading(true);

      // 上传图片并分析
      const uploadRes = await Network.uploadFile({
        url: '/api/food/upload',
        filePath: tempFilePath,
        name: 'file',
      });

      console.log('upload response:', uploadRes.data);
      setIsUploading(false);

      const responseData = uploadRes.data as any;
      if (responseData?.code === 200 && responseData?.data) {
        const { imageUrl, analysis } = responseData.data;
        setCurrentImageUrl(imageUrl);
        setCurrentFood(analysis);
        setShowChat(true);
        setConfirmed(false);

        // 初始化对话
        conversationHistory.current = [];
        setChatMessages([
          {
            role: 'assistant',
            content: `我识别到您上传的食物是「${analysis.foodName}」，估算分量约${analysis.portion}，热量约${analysis.calories}千卡。${analysis.description || ''}`,
          },
        ]);
      } else {
        Taro.showToast({
          title: '图片分析失败',
          icon: 'none',
        });
      }
    } catch (error) {
      setIsUploading(false);
      console.error('上传失败:', error);
      Taro.showToast({
        title: '上传失败',
        icon: 'none',
      });
    }
  };

  // 发送对话消息
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentFood) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // 添加用户消息
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    conversationHistory.current.push({ role: 'user', content: userMessage });

    try {
      const res = await Network.request({
        url: '/api/ai/chat',
        method: 'POST',
        data: {
          conversationHistory: conversationHistory.current,
          userMessage,
          currentFoodInfo: {
            foodName: currentFood.foodName,
            portion: currentFood.portion,
            imageUrl: currentImageUrl,
          },
        },
      });

      console.log('chat response:', res.data);
      if (res.data?.code === 200 && res.data?.data) {
        const { response, foodInfo, confirmed: isConfirmed } = res.data.data;

        // 更新食物信息
        setCurrentFood(foodInfo);

        // 添加助手回复
        setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
        conversationHistory.current.push({ role: 'assistant', content: response });

        if (isConfirmed) {
          setConfirmed(true);
        }
      }
    } catch (error) {
      console.error('对话失败:', error);
      Taro.showToast({
        title: '对话失败',
        icon: 'none',
      });
    }
  };

  // 确认保存热量记录
  const handleConfirm = async () => {
    if (!currentFood) return;

    try {
      const res = await Network.request({
        url: '/api/food/confirm',
        method: 'POST',
        data: {
          imageUrl: currentImageUrl,
          foodName: currentFood.foodName,
          portion: currentFood.portion,
          calories: currentFood.calories,
          protein: currentFood.protein,
          carbs: currentFood.carbs,
          fat: currentFood.fat,
        },
      });

      console.log('confirm response:', res.data);
      if (res.data?.code === 200) {
        Taro.showToast({
          title: '保存成功',
          icon: 'success',
        });

        // 重置状态
        setCurrentFood(null);
        setCurrentImageUrl('');
        setChatMessages([]);
        setShowChat(false);
        setConfirmed(false);
        conversationHistory.current = [];

        // 重新加载记录
        loadTodayRecords();
      }
    } catch (error) {
      console.error('保存失败:', error);
      Taro.showToast({
        title: '保存失败',
        icon: 'none',
      });
    }
  };

  // 删除记录
  const handleDeleteRecord = async (id: string) => {
    try {
      const res = await Network.request({
        url: `/api/food/records/${id}`,
        method: 'DELETE',
      });

      if (res.data?.code === 200) {
        Taro.showToast({
          title: '删除成功',
          icon: 'success',
        });
        loadTodayRecords();
      }
    } catch (error) {
      console.error('删除失败:', error);
      Taro.showToast({
        title: '删除失败',
        icon: 'none',
      });
    }
  };

  // 取消当前分析
  const handleCancel = () => {
    setCurrentFood(null);
    setCurrentImageUrl('');
    setChatMessages([]);
    setShowChat(false);
    setConfirmed(false);
    conversationHistory.current = [];
  };

  // 热量进度百分比
  const progressPercent = Math.min((todayCalories / calorieGoal) * 100, 100);

  return (
    <ScrollView className="h-full bg-gray-50" scrollY>
      <View className="p-4 pb-20">
        {/* 热量统计卡片 */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Flame size={20} color="#f97316" />
              <Text className="block text-lg">今日热量摄入</Text>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex flex-col gap-3">
              <View className="flex justify-between items-center">
                <Text className="block text-2xl font-bold text-orange-500">
                  {todayCalories}
                </Text>
                <Text className="block text-sm text-gray-500">
                  / {calorieGoal} 千卡
                </Text>
              </View>
              <Progress value={progressPercent} className="h-2" />
              <View className="flex justify-between text-xs text-gray-500">
                <Text className="block">已摄入 {progressPercent.toFixed(0)}%</Text>
                <Text className="block">
                  剩余 {Math.max(calorieGoal - todayCalories, 0)} 千卡
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* 上传食物图片区域 */}
        {!showChat && (
          <Card className="mb-4">
            <CardContent className="p-6">
              <View className="flex flex-col items-center gap-4">
                <Button
                  onClick={handleChooseImage}
                  disabled={isUploading}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  <View className="flex items-center justify-center gap-2">
                    {isUploading ? (
                      <Text className="block">上传分析中...</Text>
                    ) : (
                      <>
                        <Camera size={18} color="#fff" />
                        <Upload size={18} color="#fff" />
                        <Text className="block text-white">上传食物图片</Text>
                      </>
                    )}
                  </View>
                </Button>
                <Text className="block text-sm text-gray-500 text-center">
                  拍照或选择食物图片，AI 将自动识别并计算热量
                </Text>
              </View>
            </CardContent>
          </Card>
        )}

        {/* AI 对话区域 */}
        {showChat && currentFood && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <View className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <ChefHat size={20} color="#f97316" />
                  <Text className="block">食物分析</Text>
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <X size={16} color="#666" />
                </Button>
              </View>
            </CardHeader>
            <CardContent>
              {/* 当前识别结果 */}
              <View className="mb-4 p-3 bg-orange-50 rounded-lg">
                <View className="flex justify-between items-center mb-2">
                  <Text className="block font-semibold">{currentFood.foodName}</Text>
                  <Badge className="bg-orange-500 text-white">
                    {currentFood.calories} 千卡
                  </Badge>
                </View>
                <Text className="block text-sm text-gray-600 mb-1">
                  分量：{currentFood.portion}
                </Text>
                {currentFood.protein && (
                  <View className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      蛋白质 {currentFood.protein}g
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      碳水 {currentFood.carbs}g
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      脂肪 {currentFood.fat}g
                    </Badge>
                  </View>
                )}
              </View>

              {/* 对话消息列表 */}
              <ScrollView className="mb-4 max-h-48" scrollY>
                {chatMessages.map((msg, index) => (
                  <View
                    key={index}
                    className={`mb-2 p-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-50 ml-8'
                        : 'bg-gray-50 mr-8'
                    }`}
                  >
                    <Text className="block text-sm">{msg.content}</Text>
                  </View>
                ))}
              </ScrollView>

              {/* 输入框 */}
              <View className="flex gap-2 mb-3">
                <View className="flex-1">
                  <Input
                    className="w-full"
                    placeholder="补充食物信息，如分量、烹饪方式..."
                    value={inputMessage}
                    onInput={(e) => setInputMessage(e.detail.value)}
                  />
                </View>
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim()}
                >
                  <MessageCircle size={16} color="#fff" />
                </Button>
              </View>

              {/* 确认按钮 */}
              <Button
                onClick={handleConfirm}
                disabled={!confirmed}
                className={`w-full ${
                  confirmed ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300'
                }`}
              >
                <View className="flex items-center justify-center gap-2">
                  <Check size={18} color="#fff" />
                  <Text className="block text-white">
                    {confirmed ? '确认保存' : '请先确认食物信息'}
                  </Text>
                </View>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 今日饮食记录列表 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Text className="block">今日饮食记录</Text>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <View className="text-center py-8 text-gray-500">
                <Text className="block">暂无记录</Text>
                <Text className="block text-sm mt-1">
                  上传食物图片开始记录
                </Text>
              </View>
            ) : (
              <View className="flex flex-col gap-3">
                {records.map((record) => (
                  <View
                    key={record.id}
                    className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100"
                  >
                    <View className="flex-1">
                      <View className="flex items-center gap-2 mb-1">
                        <Text className="block font-medium">
                          {record.food_name}
                        </Text>
                        <Badge className="bg-orange-100 text-orange-600">
                          {record.calories} 千卡
                        </Badge>
                      </View>
                      <Text className="block text-xs text-gray-500">
                        {record.portion}
                      </Text>
                    </View>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRecord(record.id)}
                    >
                      <Trash2 size={16} color="#999" />
                    </Button>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
};

export default IndexPage;