import { pgTable, serial, timestamp, varchar, integer, text, jsonb, index, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 训练计划表
export const trainingPlans = pgTable(
  "training_plans",
  {
    id: serial().primaryKey(),
    title: varchar("title", { length: 100 }).notNull(),
    description: text("description"),
    goal: varchar("goal", { length: 50 }).notNull().default("general"), // general, weight_loss, muscle_gain, endurance
    intensity: varchar("intensity", { length: 20 }).notNull().default("medium"), // low, medium, high
    duration_minutes: integer("duration").notNull().default(30),
    exercises: jsonb("exercises").notNull().default(sql`'[]'::jsonb`),
    total_calories_burn: integer("total_calories_burn"),
    calories_target: integer("calories_target"),
    preferences: jsonb("preferences").default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active, completed, paused
    user_id: varchar("user_id", { length: 50 }).notNull().default("anonymous"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("training_plans_status_idx").on(table.status),
    index("training_plans_user_id_idx").on(table.user_id),
    index("training_plans_created_at_idx").on(table.created_at),
  ]
);

// 热量记录表
export const calorieRecords = pgTable(
  "calorie_records",
  {
    id: serial().primaryKey(),
    food_name: varchar("food_name", { length: 100 }).notNull(),
    image_url: text("image_url"),
    image_key: varchar("image_key", { length: 200 }),
    portion: varchar("portion", { length: 50 }),
    calories: integer("calories").notNull(),
    protein: integer("protein"),
    carbs: integer("carbs"),
    fat: integer("fat"),
    meal_type: varchar("meal_type", { length: 20 }).notNull().default("snack"), // breakfast, lunch, dinner, snack
    record_date: date("record_date").notNull().default(sql`CURRENT_DATE`),
    user_id: varchar("user_id", { length: 50 }).notNull().default("anonymous"),
    conversation_id: varchar("conversation_id", { length: 36 }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calorie_records_user_id_idx").on(table.user_id),
    index("calorie_records_record_date_idx").on(table.record_date),
    index("calorie_records_meal_type_idx").on(table.meal_type),
    index("calorie_records_created_at_idx").on(table.created_at),
  ]
);

// 对话历史表
export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
    context: jsonb("context"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("conversations_created_at_idx").on(table.created_at),
  ]
);