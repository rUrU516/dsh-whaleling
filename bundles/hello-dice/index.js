/**
 * hello-dice —— 最小 Host 插件。
 *
 * 契约只有三个导出：
 *   name   —— 诊断用的插件名
 *   inject —— 依赖的服务；DSH 等 ctx.tools 真的可用才调用 apply
 *   apply  —— (ctx, config) => void，所有副作用从这里挂出去
 *
 * 这里不 import 任何包：插件运行在 harness 进程里，需要的东西只有 ctx。
 * 工具定义走「原始 JSON Schema」形态（parameters 直接是 JSON Schema，
 * 输出用 output.schema 声明），因此不需要 @deepseek-ai/dsh-tools 的 defineTool。
 */

export const name = 'hello-dice'

export const inject = ['tools']

const ROLL_DICE = {
  name: 'roll_dice',

  description:
    'Roll one or more N-sided dice and return the individual results. ' +
    'Use this whenever the user asks for a dice roll, a random number, or a random pick.',

  parameters: {
    type: 'object',
    properties: {
      sides: { type: 'number', description: '每颗骰子的面数，默认 6' },
      count: { type: 'number', description: '掷几颗，默认 1' },
    },
    additionalProperties: false,
  },

  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },

  async execute(args) {
    const sides = Math.max(2, Math.floor(args.sides ?? 6))
    const count = Math.max(1, Math.min(100, Math.floor(args.count ?? 1)))
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))
    return rolls.join(', ')
  },
}

export function apply(ctx) {
  ctx.tools.register(ROLL_DICE)
}
