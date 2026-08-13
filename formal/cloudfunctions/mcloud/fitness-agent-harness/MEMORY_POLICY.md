# Memory Policy

## userProfile

写入长期用户画像的信息包括：身高、体重、目标、每日热量预算、饮食偏好、忌口、训练频率、可用器械、每周安排、伤病史。所有用户画像更新都需要确认。

## dietLogs

具体饮食事件写入 `dietLogs`，例如“今天喝了一杯奶茶”。饮食记录必须先生成 `pendingWrite`，确认后才调用 `diet.log.create`。

## trainingLogs

具体训练完成事件写入 `trainingLogs`，例如“卧推 4 组，每组 8 次”。训练记录必须先生成 `pendingWrite`，确认后才调用 `training.log.create`。

## trainingPlans

训练计划新建和修改写入 `trainingPlans`。计划创建、替换、减量、调整训练日都需要确认。

## bodyMetrics

体重、体脂、BMI、围度等身体指标写入 `bodyMetrics`。文字或 OCR 识别得到的身体数据都需要确认。

## Session Only

临时澄清、工具结果、格式修复、不支持问题只保留在当前 session。

## Forbidden Long-Term Memory

工具失败、验证错误、不支持问题、临时闲聊、未确认写入不得写入长期记忆。
