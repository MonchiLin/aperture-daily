// ============ 扇贝单词 API 解密核心算法 ============
// 
// 这是一个逆向工程 (Reverse Engineering) 的实现，用于解析扇贝单词 App v4.0+ 接口返回的混淆数据。
// 扇贝使用了自定义的位移混淆算法来防止爬虫。
// 这里的实现完全移植自客户端 JS 逻辑。

class Func {
    static loop(cnt, func) {
        for (let i = 0; i < cnt; i++) func(i);
    }
}

/**
 * 32位无符号整数运算库
 * JS 的位运算默认是 32 位有符号整数。为了模拟 C/Java 风格的无符号行为，
 * 我们需要频繁使用 `>>> 0` 操作符。
 */
class Num {
    static get(num) {
        return num >>> 0;
    }
    static xor(a, b) {
        return this.get(this.get(a) ^ this.get(b));
    }
    static and(a, b) {
        return this.get(this.get(a) & this.get(b));
    }
    // 模拟 32位 溢出乘法
    static mul(a, b) {
        const high16 = ((a & 0xffff0000) >>> 0) * b;
        const low16 = (a & 0x0000ffff) * b;
        return this.get((high16 >>> 0) + (low16 >>> 0));
    }
    static shiftLeft(a, b) {
        return this.get(this.get(a) << b);
    }
    static shiftRight(a, b) {
        return this.get(a) >>> b;
    }
}

const MIN_LOOP = 8;
const PRE_LOOP = 8;

const BAY_SH0 = 1;
const BAY_SH1 = 10;
const BAY_SH8 = 8;
const BAY_MASK = 0x7fffffff;

class Random {
    constructor() {
        this.status = [];
        this.mat1 = 0;
        this.mat2 = 0;
        this.tmat = 0;
    }

    seed(seeds) {
        Func.loop(4, (idx) => {
            this.status[idx] =
                seeds.length > idx ? Num.get(seeds.charAt(idx).charCodeAt(0)) : Num.get(110);
        });
        this.mat1 = this.status[1];
        this.mat2 = this.status[2];
        this.tmat = this.status[3];
        this.init();
    }

    init() {
        Func.loop(MIN_LOOP - 1, (idx) => {
            this.status[(idx + 1) & 3] = Num.xor(
                this.status[(idx + 1) & 3],
                idx +
                1 +
                Num.mul(
                    1812433253,
                    Num.xor(this.status[idx & 3], Num.shiftRight(this.status[idx & 3], 30))
                )
            );
        });

        if (
            (this.status[0] & BAY_MASK) === 0 &&
            this.status[1] === 0 &&
            this.status[2] === 0 &&
            this.status[3] === 0
        ) {
            this.status[0] = 66;
            this.status[1] = 65;
            this.status[2] = 89;
            this.status[3] = 83;
        }

        Func.loop(PRE_LOOP, () => this.nextState());
    }

    nextState() {
        let y = this.status[3];
        let x = Num.xor(Num.and(this.status[0], BAY_MASK), Num.xor(this.status[1], this.status[2]));
        x = Num.xor(x, Num.shiftLeft(x, BAY_SH0));
        y = Num.xor(y, Num.xor(Num.shiftRight(y, BAY_SH0), x));

        this.status[0] = this.status[1];
        this.status[1] = this.status[2];
        this.status[2] = Num.xor(x, Num.shiftLeft(y, BAY_SH1));
        this.status[3] = y;

        this.status[1] = Num.xor(this.status[1], Num.and(-Num.and(y, 1), this.mat1));
        this.status[2] = Num.xor(this.status[2], Num.and(-Num.and(y, 1), this.mat2));
    }

    generate(max) {
        this.nextState();

        let t0 = this.status[3];
        const t1 = Num.xor(this.status[0], Num.shiftRight(this.status[2], BAY_SH8));
        t0 = Num.xor(t0, t1);
        t0 = Num.xor(Num.and(-Num.and(t1, 1), this.tmat), t0);

        return t0 % max;
    }
}

class Node {
    constructor() {
        this.char = '.';
        this.children = {};
    }

    getChar() {
        return this.char;
    }
    setChar(v) {
        this.char = v;
    }
    getChildren() {
        return this.children;
    }
    setChildren(k, v) {
        this.children[k] = v;
    }
}

const B32_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B64_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CNT = [1, 2, 2, 2, 2, 2];

class Tree {
    constructor() {
        this.random = new Random();
        this.sign = '';
        this.inter = {};
        this.head = new Node();
    }

    init(sign) {
        this.random.seed(sign);
        this.sign = sign;

        Func.loop(64, (i) => {
            this.addSymbol(B64_CODE[i], CNT[parseInt(String((i + 1) / 11), 10)]);
        });
        this.inter['='] = '=';
    }

    addSymbol(char, len) {
        let ptr = this.head;
        let symbol = '';

        Func.loop(len, () => {
            let innerChar = B32_CODE[this.random.generate(32)];
            while (innerChar in ptr.getChildren() && ptr.getChildren()[innerChar].getChar() !== '.') {
                innerChar = B32_CODE[this.random.generate(32)];
            }

            symbol += innerChar;
            if (!(innerChar in ptr.getChildren())) {
                ptr.setChildren(innerChar, new Node());
            }
            ptr = ptr.getChildren()[innerChar];
        });

        ptr.setChar(char);
        this.inter[char] = symbol;
        return symbol;
    }

    decode(enc) {
        let dec = '';
        for (let i = 4; i < enc.length;) {
            if (enc[i] === '=') {
                dec += '=';
                i++;
                continue;
            }
            let ptr = this.head;
            while (enc[i] in ptr.getChildren()) {
                ptr = ptr.getChildren()[enc[i]];
                i++;
            }
            dec += ptr.getChar();
        }
        return dec;
    }
}

const getIdx = (c) => {
    const x = c.charCodeAt(0);
    if (x >= 65) return x - 65;
    return x - 65 + 41;
};

const VERSION = 1;

const checkVersion = (s) => {
    const wi = getIdx(s[0]) * 32 + getIdx(s[1]);
    const x = getIdx(s[2]);
    const check = getIdx(s[3]);
    return VERSION >= (wi * x + check) % 32;
};

const base64ToBytes = (b64) => {
    if (typeof atob === 'function') {
        return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    }
    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(b64, 'base64'));
    }
    throw new Error('Shanbay: no base64 decoder available');
};

/**
 * 扇贝单词 API 响应解码器 (Main Entry)
 * 
 * 算法流程：
 * 1. 版本检查：前 4 字节包含版本和校验位。
 * 2. 随机数种子初始化：基于前 4 字节初始化 `Random` 状态机。
 * 3. 霍夫曼树重建：利用随机生成的序列动态构建解码树 (`Tree`)。
 * 4. 字符串解码：遍历树结构将混淆字符串还原为原始 Base64。
 * 5. 最终解析：Base64 -> Bytes -> UDP-8 String -> JSON
 */
export function decodeShanbayData(enc) {
    if (!checkVersion(enc)) {
        throw new Error('Shanbay: unsupported data version');
    }
    const tree = new Tree();
    tree.init(enc.slice(0, 4));
    const rawBase64 = tree.decode(enc);
    const jsonText = new TextDecoder('utf-8').decode(base64ToBytes(rawBase64));
    try {
        return JSON.parse(jsonText);
    } catch (err) {
        throw new Error(`Shanbay: failed to parse decoded payload: ${String(err)}`);
    }
}
