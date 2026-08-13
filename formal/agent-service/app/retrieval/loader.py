# app/retrieval/loader.py
# 知识 chunks 加载器 — 把 official.py 的权威数据组织成可检索文档.
#
# 数据来源 (与 Node loader.js 一致, 全部基于已发表权威文献):
#   1. 中国营养学会《中国居民膳食指南(2022)》
#   2. 国家卫健委《中国成人身体活动指南(2021)》
#   3. 杨月欣 主编《中国食物成分表(标准版)》第 6 版
#   4. WHO 2020 Guidelines on physical activity
#   5. 中国营养学会综合建议
#
# 切片粒度: 每条 chunk = 一个独立可回答的事实点.
from __future__ import annotations

from datetime import date
from typing import Any

from app.data.official import (
    DIET_DAILY,
    FOOD_ITEMS,
    MALE_ENERGY,
    FEMALE_ENERGY,
)


def _now_iso() -> str:
    return date.today().isoformat()


def _build_diet_chunks() -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    now = _now_iso()
    for key, r in DIET_DAILY.items():
        txt_parts = []
        if r.min is not None and r.max is not None:
            txt_parts.append(f"{r.label}推荐量{r.min}-{r.max}{r.unit}/天。")
        elif r.max is not None:
            txt_parts.append(f"{r.label}上限{r.max}{r.unit}/天。")
        elif r.min is not None:
            txt_parts.append(f"{r.label}至少{r.min}{r.unit}/天。")
        chunks.append({
            "id": f"diet-{key}",
            "source": "中国居民膳食指南2022",
            "sourceUrl": "https://www.chinanutri.cn",
            "title": f"{r.label}推荐量",
            "section": "膳食推荐",
            "text": " ".join(txt_parts),
            "tags": [key, "膳食", "推荐量", r.label],
            "updatedAt": now,
        })
    # 三餐能量分配
    chunks.append({
        "id": "diet-meal-energy-ratio",
        "source": "中国居民膳食指南2022",
        "title": "三餐能量分配",
        "section": "膳食推荐",
        "text": "三餐能量分配推荐早餐 30% / 午餐 40% / 晚餐 30%。加餐不超过全天 10%。",
        "tags": ["三餐", "能量", "分配"],
        "updatedAt": now,
    })
    # AMDR
    chunks.append({
        "id": "diet-amdr",
        "source": "中国居民膳食指南2022",
        "title": "宏量营养素 AMDR",
        "section": "膳食推荐",
        "text": "碳水化合物占总能量 50-65%，蛋白质 10-15%，脂肪 20-30%。饱和脂肪酸 <7%，反式脂肪酸 <1%。",
        "tags": ["宏量营养素", "AMDR", "碳水", "蛋白质", "脂肪"],
        "updatedAt": now,
    })
    # 能量需求表
    pal_cn = {"light": "轻", "moderate": "中", "vigorous": "重"}
    for gender, table in [("male", MALE_ENERGY), ("female", FEMALE_ENERGY)]:
        gen_cn = "男性" if gender == "male" else "女性"
        for age, pals in table.items():
            for pal, kcal in pals.items():
                chunks.append({
                    "id": f"diet-energy-{gender}-{age}-{pal}",
                    "source": "中国居民膳食指南2022",
                    "title": f"{gen_cn}{age}岁{pal_cn.get(pal, pal)}度活动能量需求",
                    "section": "能量需求",
                    "text": f"{gen_cn}{age}岁、身体活动水平{pal_cn.get(pal, pal)}者，每日能量需求约 {kcal} kcal。",
                    "tags": ["能量", gender, age, pal, "kcal"],
                    "updatedAt": now,
                })
    return chunks


def _build_activity_chunks() -> list[dict[str, Any]]:
    now = _now_iso()
    items = [
        ("aerobic", "有氧活动建议", "成人每周应进行 150-300 分钟中等强度有氧运动，或 75-150 分钟较高强度有氧运动，或两者等量组合。"),
        ("resistance", "抗阻训练", "成人每周应进行 ≥2 次抗阻训练，覆盖所有主要肌群。"),
        ("step", "步数推荐", "成人每日步数推荐 6000-10000 步，根据自身情况循序渐进。"),
        ("sedentary", "减少久坐", "减少静态行为，每次久坐 ≤90 分钟应起身活动 3-5 分钟。"),
        ("bout", "活动持续时间", "单次有效活动至少持续 10 分钟。"),
        ("moderate", "中等强度参考", "中等强度：储备心率 40-59%，MET 3-5.9；较高强度：储备心率 60-89%，MET ≥6。"),
    ]
    return [{
        "id": f"activity-{key}",
        "source": "中国成人身体活动指南2021",
        "sourceUrl": "http://www.nhc.gov.cn",
        "title": title,
        "section": "身体活动",
        "text": text,
        "tags": ["活动", "运动", key],
        "updatedAt": now,
    } for key, title, text in items]


def _build_food_chunks() -> list[dict[str, Any]]:
    now = _now_iso()
    chunks = []
    for it in FOOD_ITEMS:
        gi_text = f"GI={it.gi}。" if it.gi is not None else ""
        aliases = "/".join(it.aliases) + "，" if it.aliases else ""
        chunks.append({
            "id": f"food-{it.name}",
            "source": "中国食物成分表第6版",
            "sourceUrl": "https://www.chinanutri.cn",
            "title": it.name,
            "section": "食物营养",
            "text": f"{it.name}（{aliases}每 100g 可食部分）：{it.kcal} kcal，蛋白质 {it.protein} g，脂肪 {it.fat} g，碳水 {it.carb} g。{gi_text}",
            "tags": ["食物", it.category, *it.aliases],
            "updatedAt": now,
        })
    return chunks


def _build_tip_chunks() -> list[dict[str, Any]]:
    now = _now_iso()
    items = [
        ("protein-loss", "减脂期蛋白质", "减脂期建议每日蛋白质 1.2-1.6 g/kg 体重，优先选择鸡胸、鱼虾、豆腐、低脂乳制品。"),
        ("protein-gain", "增肌期蛋白质", "增肌期建议每日蛋白质 1.6-2.2 g/kg 体重，均匀分配到 4-5 餐。"),
        ("carb-preworkout", "训练前碳水", "训练前 1-2 小时摄入低 GI 碳水（全麦面包、燕麦、香蕉），有助于保持训练质量。"),
        ("carb-post", "训练后补给", "训练后 30 分钟内摄入蛋白质 20-30g + 快吸收碳水，有助于恢复与肌肉合成。"),
        ("fat-loss-cardio", "减脂心率区间", "减脂有氧推荐心率区间：储备心率 50-70%（最大心率 60-75%）。"),
        ("sleep", "睡眠", "成人每天保证 7-9 小时睡眠。睡眠不足会显著降低胰岛素敏感性与肌肉合成效率。"),
        ("water-workout", "运动补水", "运动前 2 小时饮水 400-600 ml；每 15-20 分钟补 150-200 ml；运动后按体重丢失的 1.5 倍补水。"),
    ]
    return [{
        "id": f"tip-{key}",
        "source": "中国营养学会综合建议",
        "title": title,
        "section": "营养建议",
        "text": text,
        "tags": ["建议", key],
        "updatedAt": now,
    } for key, title, text in items]


def load_all() -> list[dict[str, Any]]:
    """加载全部知识 chunks (懒加载缓存)."""
    return _build_diet_chunks() + _build_activity_chunks() + _build_food_chunks() + _build_tip_chunks()


def get_by_id(chunk_id: str) -> dict[str, Any] | None:
    for c in load_all():
        if c["id"] == chunk_id:
            return c
    return None


def list_by_section(section: str) -> list[dict[str, Any]]:
    return [c for c in load_all() if c.get("section") == section]


def manifest() -> list[dict[str, Any]]:
    chunks = load_all()
    sections: dict[str, int] = {}
    for c in chunks:
        sections[c.get("section", "")] = sections.get(c.get("section", ""), 0) + 1
    return [{"section": s, "count": n} for s, n in sections.items()]


__all__ = ["load_all", "get_by_id", "list_by_section", "manifest"]
