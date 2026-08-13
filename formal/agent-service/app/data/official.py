# app/data/official.py
# 官方膳食/活动/食物成分常量库（Python 侧）
# 数据来源：
#   - 中国营养学会《中国居民膳食指南（2022）》
#   - 国家卫健委《中国成人身体活动指南（2021）》
#   - 杨月欣 主编《中国食物成分表（标准版）》第 6 版
# 该模块的 1:1 JS 版在 cloudfunctions/mcloud/project/dazi/data/，两端必须保持同步。
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Range:
    min: float | None = None
    max: float | None = None
    unit: str = ""
    label: str = ""


DIET_GUIDELINES_VERSION = "2022.1"
DIET_GUIDELINES_SOURCE = "中国营养学会《中国居民膳食指南（2022）》"
DIET_GUIDELINES_UPDATED = "2024-12-01"

DIET_DAILY = {
    "vegetables_g": Range(300, 500, "g", "蔬菜"),
    "fruits_g": Range(200, 350, "g", "新鲜水果"),
    "whole_grain_bean_g": Range(50, 150, "g", "全谷物和杂豆"),
    "tuber_g": Range(50, 100, "g", "薯类"),
    "milk_ml": Range(300, 500, "ml", "奶及奶制品"),
    "soy_g": Range(25, 35, "g", "大豆及坚果"),
    "meat_poultry_fish_egg_g": Range(120, 200, "g", "鱼禽肉蛋"),
    "water_ml": Range(1500, 1700, "ml", "饮水"),
    "salt_g": Range(None, 5, "g", "食盐（上限）"),
    "oil_g": Range(25, 30, "g", "烹调油"),
    "added_sugar_g": Range(None, 50, "g", "添加糖（上限，建议<25g）"),
}

MEAL_ENERGY_RATIO = {"breakfast": 0.3, "lunch": 0.4, "dinner": 0.3}

CARB_AMDR = (0.50, 0.65)
PROTEIN_AMDR = (0.10, 0.15)
FAT_AMDR = (0.20, 0.30)

MALE_ENERGY = {
    "18-29": {"light": 2250, "moderate": 2600, "vigorous": 3000},
    "30-49": {"light": 2100, "moderate": 2400, "vigorous": 2700},
    "50-64": {"light": 2100, "moderate": 2300, "vigorous": 2600},
    "65-79": {"light": 2050, "moderate": 2150, "vigorous": 2350},
}
FEMALE_ENERGY = {
    "18-29": {"light": 1800, "moderate": 2100, "vigorous": 2400},
    "30-49": {"light": 1750, "moderate": 2000, "vigorous": 2250},
    "50-64": {"light": 1700, "moderate": 1900, "vigorous": 2100},
    "65-79": {"light": 1650, "moderate": 1750, "vigorous": 1900},
}


ACTIVITY_GUIDELINES_VERSION = "2021.1"
ACTIVITY_GUIDELINES_SOURCE_ADULT = "国家卫健委《中国成人身体活动指南（2021）》"
ACTIVITY_GUIDELINES_SOURCE_WHO = "WHO 2020 Guidelines on Physical Activity and Sedentary Behaviour"
ACTIVITY_GUIDELINES_UPDATED = "2024-12-01"

ACTIVITY_RULES = {
    "aerobic_min_week": Range(150, 300, "min", "中等强度有氧（每周）"),
    "aerobic_vigorous_min_week": Range(75, None, "min", "较高强度有氧（每周）"),
    "resistance_sessions_week": Range(2, None, "次", "抗阻训练（每周）"),
    "steps_daily": Range(6000, 10000, "步", "每日步数推荐"),
    "sedentary_break_min": Range(None, 90, "min", "静态行为每段时长（上限）"),
    "activity_bout_min": Range(10, None, "min", "单次有效活动最短时长"),
}


def estimate_energy(gender: str, age: int, pal: str = "moderate") -> int | None:
    table = MALE_ENERGY if gender == "male" else FEMALE_ENERGY
    if age <= 29:
        bucket = "18-29"
    elif age <= 49:
        bucket = "30-49"
    elif age <= 64:
        bucket = "50-64"
    else:
        bucket = "65-79"
    return table[bucket].get(pal)


def audit_diet(nutrient: dict) -> list[dict]:
    out = []
    for k, r in DIET_DAILY.items():
        if k not in nutrient:
            continue
        v = float(nutrient[k] or 0)
        ok = True
        if r.min is not None and v < r.min:
            ok = False
        if r.max is not None and v > r.max:
            ok = False
        out.append({"field": k, "ok": ok, "value": v, "range": r})
    return out


def audit_activity(stats: dict) -> dict:
    suggestions: list[str] = []
    weekly = float(stats.get("weeklyMinutes") or 0)
    resistance = float(stats.get("resistanceSessions") or 0)
    aerobic_status = "below" if weekly < 150 else ("meets" if weekly <= 300 else "exceeds")
    resistance_status = "meets" if resistance >= ACTIVITY_RULES["resistance_sessions_week"].min else "below"
    if aerobic_status == "below":
        suggestions.append(f"本周有氧 {weekly:.0f} 分钟，未达 150 分钟下限，建议每日加 1 次 20-30 分钟快走/慢跑。")
    if resistance_status == "below":
        suggestions.append(f"本周抗阻训练 {resistance:.0f} 次，未达 2 次下限，建议补充 1 次自重训练。")
    return {
        "status": "below" if (aerobic_status == "below" or resistance_status == "below") else "meets",
        "suggestions": suggestions,
    }


def build_diet_prompt_context() -> str:
    lines = [f"【膳食常量库 版本={DIET_GUIDELINES_VERSION} 来源={DIET_GUIDELINES_SOURCE}】"]
    for k, r in DIET_DAILY.items():
        if r.min is not None and r.max is not None:
            lines.append(f"- {r.label} {r.min}-{r.max}{r.unit}/天")
        elif r.max is not None:
            lines.append(f"- {r.label} <{r.max}{r.unit}/天")
        else:
            lines.append(f"- {r.label} {r.min}{r.unit}/天")
    lines.append("- 三餐能量分配：早餐 30% / 午餐 40% / 晚餐 30%")
    lines.append("- 宏量营养素 AMDR：碳水 50-65%、蛋白质 10-15%、脂肪 20-30%")
    return "\n".join(lines)


def build_activity_prompt_context() -> str:
    return (
        f"【身体活动常量库 版本={ACTIVITY_GUIDELINES_VERSION} 来源={ACTIVITY_GUIDELINES_SOURCE_ADULT} & {ACTIVITY_GUIDELINES_SOURCE_WHO}】\n"
        "- 每周 150-300 分钟中等强度有氧（或 75 分钟较高强度）\n"
        "- 每周 ≥2 次抗阻训练，覆盖主要肌群\n"
        "- 每日步数 6000-10000\n"
        "- 主动通勤与休闲活动，鼓励爬楼、家务\n"
        "- 减少久坐，每次静态行为 ≤90 分钟应起身活动\n"
        "- 单次有效活动 ≥10 分钟\n"
        "- 中等强度：储备心率 40-59%，MET 3-5.9；较高强度：储备心率 60-89%，MET ≥6"
    )


# ===== 食物成分（精简）=====
@dataclass(frozen=True)
class FoodItem:
    name: str
    aliases: tuple[str, ...]
    category: str
    kcal: float
    protein: float
    fat: float
    carb: float
    gi: float | None = None


FOOD_COMPOSITION_VERSION = "6.0.1"
FOOD_COMPOSITION_SOURCE = "中国食物成分表（标准版）第 6 版"
FOOD_COMPOSITION_UPDATED = "2024-12-01"
FOOD_TOLERANCE = 0.10


def _food(name, aliases, category, kcal, protein, fat, carb, gi=None):
    return FoodItem(name=name, aliases=tuple(aliases or ()), category=category,
                    kcal=kcal, protein=protein, fat=fat, carb=carb, gi=gi)


FOOD_ITEMS: list[FoodItem] = [
    _food("米饭（蒸熟，粳米）", ["白米饭","大米饭"], "staple", 116, 2.6, 0.3, 25.6, 83),
    _food("馒头（小麦粉）", ["白馒头"], "staple", 223, 7.0, 1.3, 47.0, 88),
    _food("面条（小麦粉，煮）", ["白面条"], "staple", 109, 3.9, 0.4, 23.0, 81),
    _food("小米粥", ["小米汤"], "staple", 46, 1.4, 0.7, 8.4, 71),
    _food("燕麦片", ["即食燕麦"], "staple", 367, 13.2, 6.5, 67.0, 55),
    _food("玉米（鲜）", ["甜玉米"], "staple", 112, 4.0, 1.2, 22.8, 55),
    _food("红薯", ["地瓜","番薯"], "staple", 86, 1.6, 0.2, 20.1, 75),
    _food("土豆", ["马铃薯"], "staple", 81, 2.0, 0.2, 17.8, 62),
    _food("全麦面包", [], "staple", 246, 9.2, 2.4, 48.5, 65),
    _food("鸡胸肉", ["鸡胸"], "meat", 167, 19.4, 9.0, 0.7),
    _food("牛肉（瘦）", ["牛腱子"], "meat", 106, 20.0, 2.0, 1.0),
    _food("猪肉（瘦）", ["瘦肉"], "meat", 143, 20.3, 6.2, 1.5),
    _food("猪里脊", [], "meat", 155, 20.2, 7.9, 0.7),
    _food("羊肉（瘦）", [], "meat", 118, 19.0, 3.9, 0.5),
    _food("鸭肉", [], "meat", 240, 15.5, 19.7, 0.2),
    _food("草鱼", [], "meat", 113, 16.6, 5.0, 0),
    _food("鲈鱼", [], "meat", 105, 18.6, 3.4, 0),
    _food("三文鱼", ["鲑鱼"], "meat", 208, 20.4, 13.4, 0),
    _food("虾仁", ["虾"], "meat", 93, 18.6, 1.0, 1.4),
    _food("鸡腿肉", [], "meat", 181, 16.7, 12.6, 0),
    _food("鸡蛋（白壳）", ["鸡蛋"], "egg", 144, 12.8, 10.1, 1.4),
    _food("鸭蛋", [], "egg", 180, 12.6, 13.0, 3.1),
    _food("牛奶（全脂）", ["纯牛奶"], "dairy", 54, 3.0, 3.2, 3.4),
    _food("牛奶（脱脂）", [], "dairy", 33, 3.1, 0.3, 4.8),
    _food("酸奶（全脂）", [], "dairy", 76, 2.5, 3.0, 9.7),
    _food("无糖酸奶", ["0 糖酸奶"], "dairy", 63, 3.0, 3.3, 5.2),
    _food("奶酪", ["干酪"], "dairy", 328, 22.6, 26.0, 3.6),
    _food("豆腐（北豆腐）", [], "dairy", 116, 12.2, 8.1, 1.9),
    _food("豆浆（无糖）", [], "dairy", 31, 3.8, 1.5, 1.4),
    _food("苹果", [], "fruit", 53, 0.4, 0.1, 13.4, 36),
    _food("香蕉", [], "fruit", 93, 1.4, 0.2, 22.0, 52),
    _food("橙子", [], "fruit", 47, 0.8, 0.2, 11.1, 43),
    _food("葡萄", [], "fruit", 44, 0.5, 0.2, 10.3, 43),
    _food("西红柿", ["番茄"], "vegetable", 20, 0.9, 0.2, 4.0, 15),
    _food("黄瓜", [], "vegetable", 16, 0.8, 0.2, 2.9, 15),
    _food("生菜", [], "vegetable", 13, 1.0, 0.2, 2.1, 15),
    _food("菠菜", [], "vegetable", 28, 2.6, 0.3, 4.5, 15),
    _food("胡萝卜", [], "vegetable", 46, 1.0, 0.2, 10.2, 47),
    _food("西兰花", ["花椰菜"], "vegetable", 34, 2.8, 0.4, 4.3, 15),
    _food("白菜", ["大白菜"], "vegetable", 18, 1.5, 0.1, 3.2, 23),
    _food("茄子", [], "vegetable", 23, 1.1, 0.2, 5.0, 15),
    _food("蘑菇", ["白蘑菇"], "vegetable", 22, 3.1, 0.1, 3.3, 10),
    _food("杏仁", [], "nut", 578, 21.2, 50.0, 19.5),
    _food("核桃", [], "nut", 656, 15.2, 65.0, 13.4),
    _food("花生（炒）", [], "nut", 587, 23.9, 44.3, 21.4),
    _food("腰果", [], "nut", 552, 18.5, 43.8, 30.2),
    _food("菜籽油", [], "oil", 899, 0, 99.9, 0),
    _food("橄榄油", [], "oil", 899, 0, 99.9, 0),
    _food("白砂糖", [], "sugar", 400, 0, 0, 99.8, 65),
    _food("蜂蜜", [], "sugar", 321, 0.5, 0, 75.6, 58),
]


def search_food(name: str, top_n: int = 5) -> list[FoodItem]:
    q = (name or "").strip().lower()
    if not q:
        return []
    scored: list[tuple[int, FoodItem]] = []
    for it in FOOD_ITEMS:
        score = 0
        if it.name == name:
            score = 100
        elif it.name in name:
            score = 80
        elif name in it.name:
            score = 70
        for a in it.aliases:
            if a == name:
                score = max(score, 95)
            elif a in name or name in a:
                score = max(score, 75)
        if score:
            scored.append((score, it))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored[:top_n]]


def food_portion(item: FoodItem, grams: float) -> dict:
    k = grams / 100.0
    return {
        "kcal": round(item.kcal * k, 1),
        "protein": round(item.protein * k, 2),
        "fat": round(item.fat * k, 2),
        "carb": round(item.carb * k, 2),
    }


def build_food_prompt_context() -> str:
    return (
        f"【食物成分常量库 {FOOD_COMPOSITION_VERSION}，来源={FOOD_COMPOSITION_SOURCE}，"
        f"单位=每 100g 可食部分，波动≈±{int(FOOD_TOLERANCE*100)}%】\n"
        f"内置 {len(FOOD_ITEMS)} 条常用食物。AI 估算卡路里与三大营养素时：\n"
        "1) 命中条目用表中数值；\n"
        "2) 未命中条目按\"主类相近 + 烹饪方式\"推断并给出 ±10% 范围；\n"
        "3) 不可编造具体品牌/外卖产品的精确热量。"
    )


def build_official_constraints_prompt() -> str:
    return (
        "【以下为必须遵守的官方约束，模型不得编造数值】\n\n"
        + build_diet_prompt_context()
        + "\n\n"
        + build_activity_prompt_context()
        + "\n\n"
        + build_food_prompt_context()
        + "\n\n"
        + "【来源标注规则】\n"
        + "回答中涉及官方推荐量或食物营养数据时，必须在尾部追加来源（格式：[来源: 中国居民膳食指南2022 / 中国食物成分表6.0 / 中国成人身体活动指南2021]），不得省略。"
    )


def manifest() -> list[dict]:
    return [
        {"key": "diet_guidelines", "version": DIET_GUIDELINES_VERSION, "source": DIET_GUIDELINES_SOURCE, "updated": DIET_GUIDELINES_UPDATED},
        {"key": "activity_guidelines", "version": ACTIVITY_GUIDELINES_VERSION, "source": ACTIVITY_GUIDELINES_SOURCE_ADULT, "updated": ACTIVITY_GUIDELINES_UPDATED},
        {"key": "food_composition", "version": FOOD_COMPOSITION_VERSION, "source": FOOD_COMPOSITION_SOURCE, "updated": FOOD_COMPOSITION_UPDATED, "count": len(FOOD_ITEMS)},
    ]


__all__ = [
    "Range", "FoodItem",
    "DIET_DAILY", "MEAL_ENERGY_RATIO", "CARB_AMDR", "PROTEIN_AMDR", "FAT_AMDR",
    "MALE_ENERGY", "FEMALE_ENERGY", "ACTIVITY_RULES",
    "FOOD_ITEMS", "FOOD_TOLERANCE",
    "estimate_energy", "audit_diet", "audit_activity",
    "search_food", "food_portion",
    "build_diet_prompt_context", "build_activity_prompt_context",
    "build_food_prompt_context", "build_official_constraints_prompt",
    "manifest",
]