const userStorage = require("../../../biz/user_storage.js");
const workoutHelper = require("../../../../../helper/workout_calorie_helper.js");
const goalConfig = require("../../../config/goal_config.js");
const safeTop = require("../../../../../helper/safe_top.js");

const STORAGE_KEY = "fitness_training_plan";
const STATS_KEY = "fitness_workout_stats";
const TIMER_KEY = "fitness_rest_timer";
const PROFILE_KEY = "fitness_profile";
const DEFAULT_REST_SECONDS = 60;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameId(left, right) {
  return String(left) === String(right);
}

function getDateLabel(date) {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const key = formatDate(date);
  return {
    primary: key === formatDate(new Date()) ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`,
    secondary: weekdays[date.getDay()]
  };
}

function seedExercises() {
  return [
    {
      id: 1,
      name: "杠铃深蹲",
      expanded: true,
      sets: [
        { id: 11, weight: "60", reps: "10", completed: false },
        { id: 12, weight: "70", reps: "8", completed: false },
        { id: 13, weight: "80", reps: "6", completed: false }
      ]
    },
    {
      id: 2,
      name: "哑铃卧推",
      expanded: false,
      sets: [
        { id: 21, weight: "20", reps: "12", completed: false },
        { id: 22, weight: "22.5", reps: "10", completed: false }
      ]
    },
    {
      id: 3,
      name: "坐姿划船",
      expanded: false,
      sets: [
        { id: 31, weight: "45", reps: "12", completed: false },
        { id: 32, weight: "45", reps: "10", completed: false }
      ]
    },
    {
      id: 4,
      name: "平板支撑",
      expanded: false,
      sets: [
        { id: 41, weight: "", reps: "60", completed: false }
      ]
    }
  ];
}

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 88,
    selectedDate: "",
    dateLabel: "今天",
    weekdayLabel: "",
    exercises: [],
    swipeExerciseId: "",
    swipeSetKey: "",
    editor: {
      visible: false,
      mode: "",
      exerciseId: "",
      setId: "",
      field: "",
      title: "",
      value: "",
      unit: "",
      min: 0,
      max: 9999
    },
    workoutSummary: {
      totalCalories: 0,
      durationMinutes: 0,
      completedExercises: 0,
      completedSets: 0,
      totalSets: 0,
      muscles: []
    },
    workoutProgress: 0,
    profileNotice: "",
    goalStrategy: null,
    restTimer: {
      visible: false,
      remaining: DEFAULT_REST_SECONDS,
      display: "01:00",
      running: false,
      finished: false
    }
  },

  onLoad() {
    const today = new Date();
    const label = getDateLabel(today);
    this.setData(Object.assign(safeTop.injectInto({}), {
      selectedDate: formatDate(today),
      dateLabel: label.primary,
      weekdayLabel: label.secondary
    }));
    this._loadPlan();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ current: 3 });
    const result = wx.getStorageSync("fitness_calendar_result");
    if (result && result.mode === "training" && result.date) {
      wx.removeStorageSync("fitness_calendar_result");
      const date = new Date(`${result.date}T12:00:00`);
      const label = getDateLabel(date);
      this.setData({
        selectedDate: result.date,
        dateLabel: label.primary,
        weekdayLabel: label.secondary
      });
    }
    this._startActiveSession();
    this._refreshGoalStrategy();
    if (this.data.selectedDate) this._loadPlan();
    this._restoreRestTimer();
  },

  onHide() {
    this._stopActiveSession();
    this._clearTimerInterval();
  },

  onUnload() {
    this._stopActiveSession();
    this._clearTimerInterval();
  },

  openCalendar() {
    wx.navigateTo({
      url: `../../common/calendar/date_calendar?mode=training&date=${this.data.selectedDate}`
    });
  },

  toggleExercise(e) {
    const id = e.currentTarget.dataset.id;
    const exercises = this.data.exercises.map(item => (
      sameId(item.id, id) ? Object.assign({}, item, { expanded: !item.expanded }) : item
    ));
    this.setData({ exercises });
    this._savePlan();
  },

  updateSet(e) {
    const exerciseId = e.currentTarget.dataset.exercise;
    const setId = e.currentTarget.dataset.set;
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value.replace(/[^\d.]/g, "");
    const exercises = this.data.exercises.map(exercise => {
      if (!sameId(exercise.id, exerciseId)) return exercise;
      const sets = exercise.sets.map(set => (
        sameId(set.id, setId) && !set.completed
          ? Object.assign({}, set, { [field]: value })
          : set
      ));
      return Object.assign({}, exercise, { sets });
    });
    this.setData({ exercises });
    this._savePlan();
    this._refreshWorkoutSummary();
  },

  openSetEditor(e) {
    const exerciseId = e.currentTarget.dataset.exercise;
    const setId = e.currentTarget.dataset.set;
    const field = e.currentTarget.dataset.field;
    const exercise = this.data.exercises.find(item => sameId(item.id, exerciseId));
    const set = exercise && exercise.sets.find(item => sameId(item.id, setId));
    if (!set || set.completed) return;
    this.setData({
      editor: {
        visible: true,
        mode: "set",
        exerciseId,
        setId,
        field,
        title: field === "weight" ? "修改重量" : "修改次数",
        value: set[field] || "",
        unit: field === "weight" ? "kg" : "reps",
        min: 0,
        max: field === "weight" ? 500 : 1000
      }
    });
  },

  openRestEditor(e) {
    const exerciseId = e.currentTarget.dataset.id;
    const exercise = this.data.exercises.find(item => sameId(item.id, exerciseId));
    if (!exercise) return;
    this.setData({
      editor: {
        visible: true,
        mode: "rest",
        exerciseId,
        setId: "",
        field: "restSeconds",
        title: `修改 ${exercise.name} 组间休息`,
        value: exercise.restSeconds || this._getRestSeconds(),
        unit: "sec",
        min: 10,
        max: 600
      }
    });
  },

  closeEditor() {
    this.setData({ "editor.visible": false });
  },

  confirmEditor(e) {
    const value = e.detail.value;
    const editor = this.data.editor;
    if (editor.mode === "rest") {
      const exercises = this.data.exercises.map(exercise => (
        sameId(exercise.id, editor.exerciseId)
          ? Object.assign({}, exercise, { restSeconds: Number(value) })
          : exercise
      ));
      this.setData({ exercises, "editor.visible": false });
      this._savePlan();
      return;
    }
    const exercises = this.data.exercises.map(exercise => {
      if (!sameId(exercise.id, editor.exerciseId)) return exercise;
      return Object.assign({}, exercise, {
        sets: exercise.sets.map(set => (
          sameId(set.id, editor.setId)
            ? Object.assign({}, set, { [editor.field]: value })
            : set
        ))
      });
    });
    this.setData({ exercises, "editor.visible": false });
    this._savePlan();
    this._refreshWorkoutSummary();
  },

  toggleSet(e) {
    const exerciseId = e.currentTarget.dataset.exercise;
    const setId = e.currentTarget.dataset.set;
    let becameCompleted = false;
    const exercises = this.data.exercises.map(exercise => {
      if (!sameId(exercise.id, exerciseId)) return exercise;
      const sets = exercise.sets.map(set => {
        if (!sameId(set.id, setId)) return set;
        const completed = !set.completed;
        becameCompleted = completed;
        return Object.assign({}, set, {
          completed,
          done: completed,
          completedAt: completed ? Date.now() : 0
        });
      });
      return Object.assign({}, exercise, { sets });
    });
    this.setData({ exercises });
    this._markWorkoutStarted();
    this._savePlan();
    this._refreshWorkoutSummary();
    if (becameCompleted) {
      const exercise = exercises.find(item => sameId(item.id, exerciseId));
      this._startRestTimer(
        exerciseId,
        setId,
        Number(exercise && exercise.restSeconds) || this._getRestSeconds()
      );
    } else if (
      sameId(this.data.restTimer.sourceExerciseId, exerciseId) &&
      sameId(this.data.restTimer.sourceSetId, setId)
    ) {
      this.skipRestTimer();
    }
  },

  addSet(e) {
    const id = e.currentTarget.dataset.id;
    const exercises = this.data.exercises.map(exercise => {
      if (!sameId(exercise.id, id)) return exercise;
      const previous = exercise.sets[exercise.sets.length - 1] || {};
      return Object.assign({}, exercise, {
        sets: exercise.sets.concat({
          id: Date.now(),
          weight: previous.weight || "",
          reps: previous.reps || "",
          completed: false,
          done: false
        })
      });
    });
    this.setData({ exercises });
    this._savePlan();
    this._refreshWorkoutSummary();
  },

  deleteSet(e) {
    const exerciseId = e.currentTarget.dataset.exercise;
    const setId = e.currentTarget.dataset.set;
    const exercise = this.data.exercises.find(item => sameId(item.id, exerciseId));
    if (!exercise) return;
    if (exercise.sets.length <= 1) {
      wx.showActionSheet({
        alertText: `当前训练动作 ${exercise.name} 只剩最后一组，可选择删除当前组或整个动作。`,
        itemList: ["删除当前组并保留动作", "删除整个动作"],
        itemColor: "#D64545",
        success: ({ tapIndex }) => {
          if (tapIndex === 0) this._removeSet(exerciseId, setId);
          if (tapIndex === 1) {
            this.deleteExercise({ currentTarget: { dataset: { id: exerciseId } } });
          }
        }
      });
      return;
    }
    this._removeSet(exerciseId, setId);
  },

  onExerciseSwipeStart(e) {
    const touch = e.touches && e.touches[0];
    this._exerciseSwipeStartX = touch ? touch.clientX : 0;
  },

  onExerciseSwipeEnd(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    const delta = (touch ? touch.clientX : 0) - (this._exerciseSwipeStartX || 0);
    if (delta < -35) {
      const target = this.data.exercises.find(item => (
        sameId(item.id, e.currentTarget.dataset.id)
      ));
      this.setData({ swipeExerciseId: target ? target.id : "", swipeSetKey: "" });
    } else if (delta > 25) {
      this.setData({ swipeExerciseId: "" });
    }
  },

  onSetSwipeStart(e) {
    const touch = e.touches && e.touches[0];
    this._setSwipeStartX = touch ? touch.clientX : 0;
  },

  onSetSwipeEnd(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    const delta = (touch ? touch.clientX : 0) - (this._setSwipeStartX || 0);
    if (delta < -35) {
      this.setData({
        swipeSetKey: `${e.currentTarget.dataset.exercise}:${e.currentTarget.dataset.set}`,
        swipeExerciseId: ""
      });
    } else if (delta > 25) {
      this.setData({ swipeSetKey: "" });
    }
  },

  closeSwipes() {
    if (this.data.swipeExerciseId || this.data.swipeSetKey) {
      this.setData({ swipeExerciseId: "", swipeSetKey: "" });
    }
  },

  noop() {},

  deleteExercise(e) {
    const id = e.currentTarget.dataset.id;
    const exercise = this.data.exercises.find(item => sameId(item.id, id));
    if (!exercise) return;
    wx.showModal({
      title: "删除训练动作",
      content: `删除后将移除动作 ${exercise.name} 及其全部组数记录，此操作不可恢复。`,
      confirmText: "删除",
      confirmColor: "#D64545",
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({
          exercises: this.data.exercises.filter(item => !sameId(item.id, id)),
          swipeExerciseId: "",
          swipeSetKey: ""
        });
        this._savePlan();
        this._refreshWorkoutSummary();
      }
    });
  },

  manageExercise(e) {
    const id = e.currentTarget.dataset.id;
    const exercise = this.data.exercises.find(item => sameId(item.id, id));
    if (!exercise) return;
    wx.showActionSheet({
      alertText: exercise.name,
      itemList: ["复制当前动作", "删除整个动作"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          const now = Date.now();
          const copy = Object.assign({}, exercise, {
            id: now,
            name: `${exercise.name}（副本）`,
            completed: false,
            sets: exercise.sets.map((set, index) => Object.assign({}, set, {
              id: now + index + 1,
              completed: false,
              done: false,
              completedAt: 0
            }))
          });
          this.setData({ exercises: this.data.exercises.concat(copy) });
          this._savePlan();
          this._refreshWorkoutSummary();
        } else {
          this.deleteExercise({ currentTarget: { dataset: { id } } });
        }
      }
    });
  },

  openExerciseEditor() {
    wx.navigateTo({
      url: `../exercise/exercise_editor?date=${this.data.selectedDate}`
    });
  },

  pauseRestTimer() {
    if (!this.data.restTimer.running) return;
    this._clearTimerInterval();
    const remaining = this._currentTimerRemaining();
    this._setRestTimer({ remaining, running: false, endAt: 0 });
  },

  resumeRestTimer() {
    if (this.data.restTimer.running || this.data.restTimer.remaining <= 0) return;
    const endAt = Date.now() + this.data.restTimer.remaining * 1000;
    this._setRestTimer({ running: true, endAt });
    this._runTimerInterval();
  },

  skipRestTimer() {
    this._clearTimerInterval();
    userStorage.remove(TIMER_KEY);
    this.setData({
      restTimer: {
        visible: false,
        remaining: DEFAULT_REST_SECONDS,
        display: "01:00",
        running: false,
        finished: false,
        sourceExerciseId: 0,
        sourceSetId: 0
      }
    });
  },

  _loadPlan() {
    const allPlans = userStorage.get(STORAGE_KEY, {});
    const source = allPlans[this.data.selectedDate] || seedExercises();
    const exercises = source.map(workoutHelper.normalizeExercise);
    this.setData({ exercises, swipeExerciseId: "", swipeSetKey: "" });
    this._refreshWorkoutSummary();
  },

  _removeSet(exerciseId, setId) {
    const exercises = this.data.exercises.map(item => {
      if (!sameId(item.id, exerciseId)) return item;
      const sets = item.sets
        .filter(set => !sameId(set.id, setId))
        .map((set, index) => Object.assign({}, set, { setIndex: index + 1 }));
      return Object.assign({}, item, { sets });
    });
    const timerMatches = sameId(this.data.restTimer.sourceExerciseId, exerciseId) &&
      sameId(this.data.restTimer.sourceSetId, setId);
    this.setData({ exercises, swipeSetKey: "" });
    if (timerMatches) this.skipRestTimer();
    this._savePlan();
    this._refreshWorkoutSummary();
  },

  _savePlan() {
    const allPlans = userStorage.get(STORAGE_KEY, {});
    allPlans[this.data.selectedDate] = this.data.exercises;
    userStorage.set(STORAGE_KEY, allPlans);
  },

  _markWorkoutStarted() {
    const stats = userStorage.get(STATS_KEY, {});
    const current = stats[this.data.selectedDate] || {};
    if (!current.startedAt) {
      current.startedAt = Date.now();
      current.activeDurationMs = 0;
      stats[this.data.selectedDate] = current;
      userStorage.set(STATS_KEY, stats);
    }
    if (!this._activeSessionStartedAt) this._activeSessionStartedAt = Date.now();
  },

  _refreshWorkoutSummary() {
    if (!this.data.selectedDate) return;
    const profile = userStorage.get(PROFILE_KEY, {});
    const stats = userStorage.get(STATS_KEY, {});
    const existing = stats[this.data.selectedDate] || {};
    const now = Date.now();
    const allCompleted = this.data.exercises.length > 0 && this.data.exercises.every(
      exercise => exercise.sets.length > 0 && exercise.sets.every(set => set.completed)
    );
    const endedAt = allCompleted
      ? (existing.endedAt || now)
      : 0;
    const elapsedMinutes = existing.startedAt
      ? this._getActiveElapsedMinutes(existing, now)
      : 0;
    const summary = workoutHelper.calculateWorkoutCalories({
      exercises: this.data.exercises,
      userProfile: profile,
      elapsedMinutes
    });
    const workoutSummary = Object.assign({}, summary, {
      startedAt: existing.startedAt || 0,
      endedAt,
      activeDurationMs: Math.round(elapsedMinutes * 60000),
      completed: allCompleted,
      musclesText: summary.muscles.length ? summary.muscles.join(", ") : "No muscle tags",
    });
    stats[this.data.selectedDate] = workoutSummary;
    userStorage.set(STATS_KEY, stats);
    if (allCompleted) this._activeSessionStartedAt = 0;
    const workoutProgress = summary.totalSets > 0
      ? Math.min(1, summary.completedSets / summary.totalSets)
      : 0;
    this.setData({
      exercises: summary.exercises,
      workoutSummary,
      workoutProgress,
      profileNotice: summary.profile.missingFields.length
        ? `Complete profile fields: ${summary.profile.missingFields.join(", ")} for better calorie and workout estimates.`
        : ""
    });
  },
  _getRestSeconds() {
    const settings = wx.getStorageSync("fitness_app_settings") || {};
    const profile = userStorage.get(PROFILE_KEY, {});
    const config = goalConfig.getGoalConfig(profile.goal);
    return Math.max(10, Number(settings.restSeconds) || config.defaultRestSeconds);
  },

  _refreshGoalStrategy() {
    const profile = userStorage.get(PROFILE_KEY, {});
    const config = goalConfig.getGoalConfig(profile.goal);
    this.setData({
      goalStrategy: {
        name: config.name,
        shortName: config.shortName || config.name,
        workoutFocus: config.workoutFocus,
        restSeconds: this._getRestSeconds()
      }
    });
  },

  _startActiveSession() {
    const stats = userStorage.get(STATS_KEY, {});
    const current = stats[this.data.selectedDate] || {};
    if (current.startedAt && !current.endedAt && !this._activeSessionStartedAt) {
      this._activeSessionStartedAt = Date.now();
    }
  },

  _stopActiveSession() {
    if (!this._activeSessionStartedAt || !this.data.selectedDate) return;
    const stats = userStorage.get(STATS_KEY, {});
    const current = stats[this.data.selectedDate] || {};
    current.activeDurationMs = Math.max(0, Number(current.activeDurationMs) || 0) +
      Math.max(0, Date.now() - this._activeSessionStartedAt);
    stats[this.data.selectedDate] = current;
    this._activeSessionStartedAt = 0;
    userStorage.set(STATS_KEY, stats);
  },

  _getActiveElapsedMinutes(existing, now) {
    const stored = Math.max(0, Number(existing.activeDurationMs) || 0);
    const current = this._activeSessionStartedAt
      ? Math.max(0, now - this._activeSessionStartedAt)
      : 0;
    return (stored + current) / 60000;
  },

  _startRestTimer(sourceExerciseId, sourceSetId, customSeconds) {
    this._clearTimerInterval();
    const remaining = Math.max(10, Number(customSeconds) || this._getRestSeconds());
    const endAt = Date.now() + remaining * 1000;
    this._setRestTimer({
      visible: true,
      remaining,
      running: true,
      finished: false,
      endAt,
      sourceExerciseId,
      sourceSetId
    });
    this._runTimerInterval();
  },

  _restoreRestTimer() {
    const saved = userStorage.get(TIMER_KEY, {});
    if (!saved.visible) return;
    if (saved.running && saved.endAt) {
      const remaining = Math.max(0, Math.ceil((saved.endAt - Date.now()) / 1000));
      if (!remaining) {
        this._finishRestTimer();
        return;
      }
      this._setRestTimer(Object.assign({}, saved, { remaining }), false);
      this._runTimerInterval();
      return;
    }
    this._setRestTimer(saved, false);
  },

  _runTimerInterval() {
    this._clearTimerInterval();
    this._restInterval = setInterval(() => {
      const remaining = this._currentTimerRemaining();
      if (remaining <= 0) {
        this._finishRestTimer();
        return;
      }
      this._setRestTimer({ remaining }, false);
    }, 1000);
  },

  _currentTimerRemaining() {
    const endAt = Number(this.data.restTimer.endAt) || 0;
    return endAt
      ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      : Math.max(0, Number(this.data.restTimer.remaining) || 0);
  },

  _finishRestTimer() {
    this._clearTimerInterval();
    this._setRestTimer({
      visible: true,
      remaining: 0,
      running: false,
      finished: true,
      endAt: 0
    });
    if (wx.vibrateLong) wx.vibrateLong();
    wx.showToast({ title: "Rest finished", icon: "none" });
    setTimeout(() => {
      if (this.data.restTimer.finished) this.skipRestTimer();
    }, 2500);
  },

  _setRestTimer(patch, persist = true) {
    const timer = Object.assign({}, this.data.restTimer, patch);
    timer.display = `${pad(Math.floor(timer.remaining / 60))}:${pad(timer.remaining % 60)}`;
    this.setData({ restTimer: timer });
    if (persist) userStorage.set(TIMER_KEY, timer);
  },

  _clearTimerInterval() {
    if (!this._restInterval) return;
    clearInterval(this._restInterval);
    this._restInterval = null;
  }
});
