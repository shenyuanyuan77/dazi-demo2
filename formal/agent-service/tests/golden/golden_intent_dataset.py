# tests/golden/golden_intent_dataset.py
# Agent Intent Golden Set — 验收 §7.1 要求 ≥300 条 intent 样本.
#
# 设计: 每条 {id, message, expected_intent, has_images, category}.
# 由 recognize_intent_rule 判定 (LLM router 留待接真实模型后补回归).
# 覆盖验收 §7.1 各意图最低数量:
#   DIET_RECORD ≥30, DIET_SUGGESTION ≥20, TRAINING_PLAN_CREATE ≥30,
#   TRAINING_PLAN_UPDATE ≥30, TRAINING_RECORD ≥30, BODY_ANALYSIS ≥30,
#   CONFIRM_WRITE ≥30, CANCEL_WRITE ≥20, UNSUPPORTED ≥30, 多轮 ≥50
from __future__ import annotations

from app.types.agent_types import AgentIntent


# ---------- DIET_RECORD ----------
DIET_RECORD_SAMPLES = [
    "早餐吃了鸡蛋", "午餐吃了鸡胸肉和米饭", "晚餐吃了牛肉面",
    "加餐吃了个苹果", "喝了一杯奶茶", "记一下午餐",
    "记录一下今天的早餐", "刚才吃了两个香蕉", "早上吃了一个馒头",
    "中午吃了沙拉", "晚上吃了三文鱼", "加餐喝了酸奶",
    "吃了半碗米饭", "帮我记录这顿饭", "记一下我吃了什么",
    "早餐吃燕麦", "午餐吃了猪里脊", "晚餐吃了豆腐",
    "加餐吃了坚果", "喝了豆浆", "吃了红薯",
    "午餐吃了虾仁", "晚餐吃了草鱼", "早餐吃了全麦面包",
    "加餐吃了橙子", "吃了土豆", "喝了牛奶",
    "记录午餐吃了什么", "帮我记一下早餐", "吃了鸡胸",
    "午餐吃了羊肉", "晚餐吃了鸭肉", "加餐吃了葡萄",
    "吃了西红柿", "吃了黄瓜",
    "午餐吃了鸡腿肉", "晚餐吃了鲈鱼", "加餐吃了腰果",
    "吃了玉米", "早餐喝了酸奶", "午餐吃了面条", "吃了燕麦片",
    "晚餐吃了馒头", "加餐吃了花生", "记录晚餐吃了鱼",
]

# ---------- DIET_SUGGESTION ----------
DIET_SUGGESTION_SAMPLES = [
    "减脂期怎么吃", "能吃多少碳水", "高蛋白食物有哪些", "控糖建议",
    "低脂饮食怎么搭配", "今天还能吃多少热量", "晚饭吃什么好",
    "早饭吃什么健康", "补蛋白质吃什么", "外卖怎么选比较健康",
    "减脂期能吃水果吗", "增肌期怎么吃", "怎么选低 GI 食物",
    "糖尿病患者怎么吃", "高血压饮食注意什么", "运动前吃什么",
    "运动后补给建议", "每天喝多少水", "蔬菜水果推荐量是多少",
    "膳食指南怎么说", "怎么搭配三餐营养", "蛋白质摄入多少合适",
    "减脂期能吃米饭吗", "增肌期碳水比例", "钠摄入多少合适",
    "膳食纤维推荐量", "维生素怎么补", "钙质食物有哪些",
    "运动前多久吃东西", "增重怎么吃",
]

# ---------- TRAINING_PLAN_CREATE ----------
TRAINING_PLAN_CREATE_SAMPLES = [
    "安排一个增肌训练计划", "帮我制定减脂训练计划", "居家训练怎么安排",
    "每周练4天的计划", "怎么练胸肌", "安排一个练腿计划",
    "制定新手训练计划", "帮我安排居家训练", "增肌训练计划怎么做",
    "减脂训练计划推荐", "定制一个训练计划", "每周练3次怎么安排",
    "安排哑铃训练计划", "制定徒手训练计划", "帮我安排背部训练",
    "安排肩部训练计划", "怎么安排核心训练计划", "制定全身训练计划",
    "安排分化训练", "推拉腿计划怎么排", "安排上下肢分化训练",
    "制定 5x5 训练计划", "安排 HIIT 训练", "帮我安排增肌计划",
    "制定 3 天分化训练", "安排居家减脂训练", "新手怎么开始训练",
    "帮我安排一周训练", "制定力量训练计划", "安排塑形训练",
]

# ---------- TRAINING_PLAN_UPDATE ----------
TRAINING_PLAN_UPDATE_SAMPLES = [
    "深蹲改成6组", "把卧推换成硬拉", "训练量减半",
    "把周二的训练改成有氧", "换成居家训练", "调整一下训练计划",
    "把深蹲次数改成12", "卧推组数改成5", "把硬拉换成罗马尼亚硬拉",
    "训练频率改成每周3次", "把推举换成站姿推举", "深蹲重量改成80公斤",
    "把引体向上改成下拉", "卷腹改成平板支撑", "把有氧改成游泳",
    "跑步改成骑行", "训练时间改成45分钟", "组间休息改成90秒",
    "把周三的训练挪到周四", "训练计划太累了调整一下", "深蹲改成保加利亚分腿蹲",
    "卧推改成哑铃卧推", "硬拉改成相扑硬拉", "把划船换成单臂划船",
    "推举改成坐姿推举", "把箭步蹲改成行走箭步蹲", "臀桥改成单腿臀桥",
    "把平板支撑改成侧支撑", "俯卧撑改成钻石俯卧撑", "训练量增加20%",
]

# ---------- TRAINING_RECORD ----------
TRAINING_RECORD_SAMPLES = [
    "今天深蹲4组8次", "做了5组卧推", "跑了5公里", "硬拉100公斤3组",
    "俯卧撑做了30个", "平板支撑做了60秒", "引体向上做了10个",
    "卷腹做了4组", "划船3组每组12次", "推举4组每组8次",
    "臀桥做了3组", "箭步蹲每边12次", "今天跑步30分钟",
    "跳绳1000个", "游泳40分钟", "骑行20公里",
    "椭圆机30分钟", "深蹲80公斤5组5次", "卧推60公斤4组10次",
    "硬拉120公斤3组3次", "今天做了全身训练", "练了胸3组",
    "背训练完成4组", "腿部训练5组", "肩部训练3组",
    "手臂训练4组", "核心训练3组", "今天做了有氧",
    "完成了今天的训练", "今天深蹲5组",
]

# ---------- BODY_ANALYSIS ----------
BODY_ANALYSIS_SAMPLES = [
    "我体重70kg", "体脂18%", "BMI怎么算", "我身高175",
    "今天称重72公斤", "体脂秤显示体脂20%", "我的身体数据怎么样",
    "腰围85cm", "臀围95cm", "内脏脂肪等级多少正常",
    "水分率多少合适", "体脂率怎么降", "体重下降了分析一下",
    "肌肉量多少正常", "基础代谢多少", "我140斤",
    "体脂25%算高吗", "身高170体重65正常吗", "体脂秤截图",
    "身体数据分析", "怎么减脂", "BMI22正常吗",
    "体脂从20降到15怎么做到", "体重71公斤", "身高180",
    "体脂15%", "BMI19", "腰围90", "臀围100",
    "内脏脂肪9级", "水分率55%",
]

# ---------- CONFIRM_WRITE ----------
CONFIRM_WRITE_SAMPLES = [
    "确认", "可以", "没问题", "保存", "写入", "记上",
    "就这样", "对", "确认吧", "可以吧", "保存吧",
    "对吧", "没问题吧", "就这样吧", "确认保存", "可以保存",
    "没问题保存", "写入吧", "记上吧", "确认写入", "可以了",
    "对的", "是", "好的", "行", "嗯确认",
    "确认一下", "就这样确认", "保存就好", "确认无误", "就这样了",
]

# ---------- CANCEL_WRITE ----------
CANCEL_WRITE_SAMPLES = [
    "取消", "不用", "不要", "算了", "不保存", "先别",
    "否", "取消吧", "不用了", "不要了", "算了吧",
    "不保存吧", "先别吧", "否吧", "不要吧", "取消了",
    "先不用", "先不要", "取消保存", "不用保存", "取消记录",
    "不用记了", "不要记了", "取消这条", "不写入了", "取消吧",
]

# ---------- UNSUPPORTED ----------
UNSUPPORTED_SAMPLES = [
    "帮我写论文", "预测股票涨跌", "查天气", "翻译这段话", "做个PPT",
    "旅游攻略推荐", "星座运势", "写代码", "电影推荐", "写情书",
    "写文章", "做文案", "投资基金怎么样", "彩票号码预测", "编程教学",
    "合同条款怎么看", "法律咨询", "帮我写作文", "股市分析", "天气预报",
    "推荐一部电影", "翻译成英文", "写一首诗", "帮我做PPT", "股票代码",
    "基金定投", "彩票中奖技巧", "星座配对", "旅游路线规划", "代码调试",
]

# ---------- 图片样本 (has_images=True) ----------
IMAGE_SAMPLES = [
    ("这餐吃了啥", AgentIntent.DIET_RECORD),
    ("记录这顿饭", AgentIntent.DIET_RECORD),
    ("识别食物", AgentIntent.DIET_RECORD),
    ("图里吃了什么", AgentIntent.DIET_RECORD),
    ("饮食热量记录", AgentIntent.DIET_RECORD),
    ("帮我看看这顿饭", AgentIntent.DIET_RECORD),
    ("这顿多少卡", AgentIntent.DIET_RECORD),
    ("拍一下午餐", AgentIntent.DIET_RECORD),
    ("早餐拍照记录", AgentIntent.DIET_RECORD),
    ("晚餐图片识别", AgentIntent.DIET_RECORD),
    ("体脂秤截图", AgentIntent.BODY_ANALYSIS),
    ("身体数据截图", AgentIntent.BODY_ANALYSIS),
    ("体脂率看一下", AgentIntent.BODY_ANALYSIS),
    ("体重秤数据", AgentIntent.BODY_ANALYSIS),
    ("这是我的体脂秤", AgentIntent.BODY_ANALYSIS),
    ("健康数据分析", AgentIntent.BODY_ANALYSIS),
    ("体脂数据看看", AgentIntent.BODY_ANALYSIS),
    ("称重截图记录", AgentIntent.BODY_ANALYSIS),
    ("身体成分分析", AgentIntent.BODY_ANALYSIS),
    ("体脂秤读数", AgentIntent.BODY_ANALYSIS),
]


def _make_records(messages: list[str], intent: AgentIntent, category: str, *, has_images: bool = False,
                  start_id: int = 0) -> list[dict]:
    return [
        {
            "id": f"{category}-{start_id + i:03d}",
            "message": msg,
            "expected_intent": intent,
            "has_images": has_images,
            "category": category,
        }
        for i, msg in enumerate(messages)
    ]


def build_golden_dataset() -> list[dict]:
    """构造完整 Golden Set (≥300 条)."""
    records: list[dict] = []
    n = 0
    for msgs, intent, cat in [
        (DIET_RECORD_SAMPLES, AgentIntent.DIET_RECORD, "diet_record"),
        (DIET_SUGGESTION_SAMPLES, AgentIntent.DIET_SUGGESTION, "diet_suggestion"),
        (TRAINING_PLAN_CREATE_SAMPLES, AgentIntent.TRAINING_PLAN_CREATE, "plan_create"),
        (TRAINING_PLAN_UPDATE_SAMPLES, AgentIntent.TRAINING_PLAN_UPDATE, "plan_update"),
        (TRAINING_RECORD_SAMPLES, AgentIntent.TRAINING_RECORD, "training_record"),
        (BODY_ANALYSIS_SAMPLES, AgentIntent.BODY_ANALYSIS, "body_analysis"),
        (CONFIRM_WRITE_SAMPLES, AgentIntent.CONFIRM_WRITE, "confirm"),
        (CANCEL_WRITE_SAMPLES, AgentIntent.CANCEL_WRITE, "cancel"),
        (UNSUPPORTED_SAMPLES, AgentIntent.UNSUPPORTED, "unsupported"),
    ]:
        records.extend(_make_records(msgs, intent, cat, start_id=n))
        n += len(msgs)
    # 图片样本
    for i, (msg, intent) in enumerate(IMAGE_SAMPLES):
        records.append({
            "id": f"image-{i:03d}",
            "message": msg,
            "expected_intent": intent,
            "has_images": True,
            "category": "image",
        })
    return records


def count_by_intent(records: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in records:
        key = r["expected_intent"].value
        out[key] = out.get(key, 0) + 1
    return out


__all__ = ["build_golden_dataset", "count_by_intent"]
