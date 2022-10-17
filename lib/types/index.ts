export class CustomSSEEvent {
    id: string;
    type: string;
    data: any;
    readyState: string;

    constructor(type) {
        this.id = '';
        this.type = type;
        this.data = {};
    }
}

export interface SSEOptions {
    headers?: Object;
    payload?: any;
    method?: 'POST' | 'GET';
    withCredentials?: boolean;
}
