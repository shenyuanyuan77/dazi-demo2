export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/training/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'FitAI',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#f97316',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '热量计算',
        iconPath: './assets/tabbar/flame.png',
        selectedIconPath: './assets/tabbar/flame-active.png'
      },
      {
        pagePath: 'pages/training/index',
        text: '训练计划',
        iconPath: './assets/tabbar/dumbbell.png',
        selectedIconPath: './assets/tabbar/dumbbell-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: './assets/tabbar/user.png',
        selectedIconPath: './assets/tabbar/user-active.png'
      }
    ]
  }
})