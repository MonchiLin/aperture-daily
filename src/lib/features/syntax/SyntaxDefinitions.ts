/**
 * 句子结构语法规则集中定义 (Centralized Definitions)
 * 
 * note: 此文件是 "Sentence Component Analysis" (句子成分分析) 系统的单一数据源 (SSOT)。
 * 它是连接 Backend (注入), Frontend (布局计算), 和 UI (帮助面板) 的桥梁。
 * 
 * 系统控制范围:
 * 1. 视觉渲染 (颜色, 标签文本)
 * 2. DOM 嵌套逻辑 (通过 'priority' 属性)
 * 3. 交互行为 (通过 'noLabel' 属性)
 */

export type AnalysisRole =
    | 's' | 'v' | 'o' | 'io' | 'cmp' // 核心成分 Core
    | 'rc' | 'pp' | 'adv' | 'app'    // 从句与短语 Clauses & Phrases
    | 'pas' | 'con'                  // 语态与连接 Voice & Connectives
    | 'inf' | 'ger' | 'ptc';         // 非谓语动词 Non-finite

/**
 * 语法规则定义接口
 * 
 * @property id       - 唯一标识符 (例如 's', 'v')
 * @property label    - 悬浮标签上显示的简写 (例如 'S')
 * @property name     - 人类可读的全名 (双语, 用于帮助面板)
 * @property desc     -在此处显示的教育性描述
 * @property example  - 图例中的示例句子
 * @property target   - 示例句子中高亮显示的目标部分
 * @property color    - 标签背景色和文本高亮色的 Hex 代码
 * 
 * @property priority - 嵌套优先级控制 (NESTING CONTROL):
 *                      - 数值越小 = 优先级越高 = 作为 *外层* 包裹容器 (Outer Wrapper)。
 *                      - 优先级 1 的元素会包裹优先级 10 的元素。
 *                      - 例如: 'rc' (0) 包裹 's' (1)。 'pas' (1) 包裹 'v' (2)。
 *                      - 冲突解决: 如果范围完全相同，优先级数值更小 (更高优先级) 的元素会在外层。
 * 
 * @property noLabel  - 渲染控制 (RENDERING CONTROL):
 *                      - 如果为 true，TagLayout 系统将 *不会* 为此角色生成悬浮标签。
 *                      - 文本仍然会在 DOM 中被标记，并且可能有颜色/下划线，
 *                        但为了防止视觉混乱，会隐藏悬浮标签。
 *                      - 适用于连接词 (Connectives) 或仅需颜色提示的虚词。
 */
export interface SyntaxRuleDef {
    id: AnalysisRole;
    label: string;
    name: string;
    desc: string;
    example: string;
    target: string;
    color: string;
    priority: number;
    noLabel?: boolean;
}

export const SYNTAX_DEFINITIONS: Record<AnalysisRole, SyntaxRuleDef> = {
    // --- 核心成分 (Core) ---
    's': {
        id: 's', label: 'S', name: '主语 (Subject)',
        desc: '执行动作的人或物。',
        example: 'The fox jumps.', target: 'The fox',
        color: '#1e3a8a',
        priority: 1
    },
    'v': {
        id: 'v', label: 'V', name: '谓语 (Verb)',
        desc: '完整的谓语动词短语（含助动词）。',
        example: 'She can do it.', target: 'can do',
        color: '#991b1b',
        priority: 2
    },
    'o': {
        id: 'o', label: 'O', name: '直接宾语 (Direct Object)',
        desc: '动作的承受者。',
        example: 'He eats an apple.', target: 'an apple',
        color: '#065f46',
        priority: 3
    },
    'io': {
        id: 'io', label: 'IO', name: '间接宾语 (Indirect Object)',
        desc: '动作的接受者。',
        example: 'She gave him a book.', target: 'him',
        color: '#047857',
        priority: 4
    },
    'cmp': {
        id: 'cmp', label: 'CMP', name: '补语 (Complement)',
        desc: '补充说明主语或宾语的成分。',
        example: 'She seems happy.', target: 'happy',
        color: '#7c3aed',
        priority: 5
    },

    // --- 从句与短语 (Clauses & Phrases) ---
    // Scope (RC, PP) usually wraps Core, so they should generally have lower priority index (processed earlier/outer)?
    // The previous array was: ['rc', 's', 'v', 'o', 'io', 'cmp', 'pp', 'adv', 'app', 'pas', 'con', 'inf', 'ger', 'ptc']
    // Let's mimic that order.
    'rc': {
        id: 'rc', label: 'RC', name: '定语从句 (Relative Clause)',
        desc: '用来修饰名词的从句。',
        example: 'The man who lives here.', target: 'who lives here',
        color: '#475569',
        priority: 0 // TOP priority (Outer wrapper)
    },
    'pp': {
        id: 'pp', label: 'PP', name: '介词短语 (Prepositional Phrase)',
        desc: '以介词开头的修饰短语。',
        example: 'In the morning, he runs.', target: 'In the morning',
        color: '#64748b',
        priority: 6
    },
    'adv': {
        id: 'adv', label: 'ADV', name: '状语 (Adverbial)',
        desc: '修饰动词、形容词或整个句子。',
        example: 'He ran quickly.', target: 'quickly',
        color: '#0369a1',
        priority: 7
    },
    'app': {
        id: 'app', label: 'APP', name: '同位语 (Appositive)',
        desc: '紧跟名词的解释性成分。',
        example: 'My friend, John, is here.', target: 'John',
        color: '#0891b2',
        priority: 8
    },

    // --- 语态与连接 (Voice & Connectives) ---
    'pas': {
        id: 'pas', label: 'PAS', name: '被动语态 (Passive Voice)',
        desc: '主语是动作的承受者。',
        example: 'The cake was eaten.', target: 'was eaten',
        color: '#c2410c',
        priority: 1
    },
    'con': {
        id: 'con', label: 'CON', name: '连接词 (Connective)',
        desc: '连接句子或观点的词。',
        example: 'However, it rained.', target: 'However',
        color: '#92400e',
        priority: 10,
        noLabel: true
    },

    // --- 非谓语动词 (Non-finite) ---
    'inf': {
        id: 'inf', label: 'INF', name: '不定式 (Infinitive)',
        desc: 'to + 动词原形，作名词、形容词或副词用。',
        example: 'I want to learn.', target: 'to learn',
        color: '#be185d',
        priority: 11
    },
    'ger': {
        id: 'ger', label: 'GER', name: '动名词 (Gerund)',
        desc: '动词-ing形式作名词用。',
        example: 'Swimming is fun.', target: 'Swimming',
        color: '#9d174d',
        priority: 12
    },
    'ptc': {
        id: 'ptc', label: 'PTC', name: '分词 (Participle)',
        desc: '现在分词或过去分词作修饰语。',
        example: 'The running water flows.', target: 'running',
        color: '#831843',
        priority: 13
    }
};

// Helper List for iteration (preserves defining order)
export const RULE_LIST = Object.values(SYNTAX_DEFINITIONS);
