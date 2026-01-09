export interface GenerateOptions {
    prompt: string;
    system?: string;
    config?: Record<string, any>;
}

export interface GenerateResponse {
    text: string;
    output?: any;
    usage?: any;
}

export interface LLMProvider {
    generate(options: GenerateOptions): Promise<GenerateResponse>;
}
