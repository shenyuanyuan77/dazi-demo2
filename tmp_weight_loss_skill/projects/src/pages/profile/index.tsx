import { View, Text, ScrollView } from '@tarojs/components';
import { User, Settings, ChevronRight, Heart, Award, Calendar } from 'lucide-react-taro';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ProfilePage = () => {
  return (
    <ScrollView className="h-full bg-gray-50" scrollY>
      <View className="p-4 pb-20">
        {/* 用户信息卡片 */}
        <Card className="mb-4">
          <CardContent className="p-6">
            <View className="flex items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <User size={32} color="#f97316" />
              </View>
              <View className="flex-1">
                <Text className="block text-lg font-semibold">健康达人</Text>
                <Text className="block text-sm text-gray-500">
                  已记录 0 天 | 累计消耗 0 千卡
                </Text>
              </View>
              <ChevronRight size={20} color="#999" />
            </View>
          </CardContent>
        </Card>

        {/* 健康数据概览 */}
        <View className="mb-3">
          <Text className="block text-lg font-semibold text-gray-800">
            健康数据
          </Text>
        </View>

        <View className="flex gap-2 mb-4">
          <Card className="flex-1">
            <CardContent className="p-3 text-center">
              <Heart size={24} color="#f97316" className="mx-auto mb-2" />
              <Text className="block text-2xl font-bold text-orange-500">0</Text>
              <Text className="block text-xs text-gray-500">今日摄入千卡</Text>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="p-3 text-center">
              <Award size={24} color="#10b981" className="mx-auto mb-2" />
              <Text className="block text-2xl font-bold text-green-500">0</Text>
              <Text className="block text-xs text-gray-500">本周训练次数</Text>
            </CardContent>
          </Card>
        </View>

        {/* 功能列表 */}
        <View className="mb-3">
          <Text className="block text-lg font-semibold text-gray-800">
            功能设置
          </Text>
        </View>

        <Card>
          <CardContent className="p-0">
            {/* 热量目标设置 */}
            <View className="flex items-center justify-between p-4 border-b border-gray-100">
              <View className="flex items-center gap-3">
                <Calendar size={20} color="#666" />
                <Text className="block">每日热量目标</Text>
              </View>
              <Badge className="bg-orange-100 text-orange-600">2000 千卡</Badge>
            </View>

            {/* 训练偏好 */}
            <View className="flex items-center justify-between p-4 border-b border-gray-100">
              <View className="flex items-center gap-3">
                <Settings size={20} color="#666" />
                <Text className="block">训练偏好设置</Text>
              </View>
              <ChevronRight size={20} color="#999" />
            </View>

            {/* 使用说明 */}
            <View className="flex items-center justify-between p-4">
              <View className="flex items-center gap-3">
                <User size={20} color="#666" />
                <Text className="block">使用说明</Text>
              </View>
              <ChevronRight size={20} color="#999" />
            </View>
          </CardContent>
        </Card>

        {/* 关于 */}
        <View className="mt-6 text-center">
          <Text className="block text-xs text-gray-400">
            健康智能体 v1.0.0
          </Text>
          <Text className="block text-xs text-gray-400 mt-1">
            专注健康饮食与训练管理
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

export default ProfilePage;