export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '训练计划' })
  : { navigationBarTitleText: '训练计划' }