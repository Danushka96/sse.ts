/**
 * Copyright (C) 2016 Maxime Petazzoni <maxime.petazzoni@bulix.org>.
 * All rights reserved.
 */

import {CustomSSEEvent, SSEOptions} from "./types";

export class SSE {
    private readonly url: string;
    private readonly options: SSEOptions;
    private readonly headers: {};
    private readonly payload: any;
    private readonly method: 'GET' | 'POST';
    private readonly withCredentials: boolean;

    private FIELD_SEPARATOR:string;
    private listeners: {};
    private xhr;
    private readyState: number;
    private progress: number;
    private chunk: string;

    INITIALIZING = -1;
    CONNECTING = 0;
    OPEN = 1;
    CLOSED = 2;

    constructor(url, options?:SSEOptions) {
        this.url = url;
        this.options = options;
        this.headers = options.headers || {};
        this.payload = options.payload !== undefined ? options.payload : '';
        this.method = options.method || (this.payload && 'POST' || 'GET');
        this.withCredentials = !!options.withCredentials;

        this.FIELD_SEPARATOR = ':';
        this.listeners = {};

        this.xhr = null;
        this.readyState = this.INITIALIZING;
        this.progress = 0;
        this.chunk = '';
    }

    addEventListener(type, listener) {
        if (this.listeners[type] === undefined) {
            this.listeners[type] = [];
        }

        if (this.listeners[type].indexOf(listener) === -1) {
            this.listeners[type].push(listener);
        }
    }

    removeEventListener(type, listener) {
        if (this.listeners[type] === undefined) {
            return;
        }

        var filtered = [];
        this.listeners[type].forEach(function(element) {
            if (element !== listener) {
                filtered.push(element);
            }
        });
        if (filtered.length === 0) {
            delete this.listeners[type];
        } else {
            this.listeners[type] = filtered;
        }
    };

    dispatchEvent(e) {
        if (!e) {
            return true;
        }

        e.source = this;

        var onHandler = 'on' + e.type;
        if (this.hasOwnProperty(onHandler)) {
            this[onHandler].call(this, e);
            if (e.defaultPrevented) {
                return false;
            }
        }

        if (this.listeners[e.type]) {
            return this.listeners[e.type].every(function(callback) {
                callback(e);
                return !e.defaultPrevented;
            });
        }

        return true;
    };

    _setReadyState(state) {
        var event = new CustomSSEEvent('readystatechange');
        event.readyState = state;
        this.readyState = state;
        this.dispatchEvent(event);
    };

    _onStreamFailure(e) {
        var event = new CustomSSEEvent('error');
        event.data = e.currentTarget.response;
        this.dispatchEvent(event);
        this.close();
    }

    _onStreamAbort(e) {
        this.dispatchEvent(new CustomSSEEvent('abort'));
        this.close();
    }

    _onStreamProgress(e) {
        if (!this.xhr) {
            return;
        }

        if (this.xhr.status !== 200) {
            this._onStreamFailure(e);
            return;
        }

        if (this.readyState == this.CONNECTING) {
            this.dispatchEvent(new CustomSSEEvent('open'));
            this._setReadyState(this.OPEN);
        }

        var data = this.xhr.responseText.substring(this.progress);
        this.progress += data.length;
        data.split(/(\r\n|\r|\n){2}/g).forEach(function(part) {
            if (part.trim().length === 0) {
                this.dispatchEvent(this._parseEventChunk(this.chunk.trim()));
                this.chunk = '';
            } else {
                this.chunk += part;
            }
        }.bind(this));
    };

    _onStreamLoaded(e) {
        this._onStreamProgress(e);

        // Parse the last chunk.
        this.dispatchEvent(this._parseEventChunk(this.chunk));
        this.chunk = '';
    };

    /**
     * Parse a received SSE event chunk into a constructed event object.
     */
    _parseEventChunk(chunk) {
        if (!chunk || chunk.length === 0) {
            return null;
        }

        var e = {'id': null, 'retry': null, 'data': '', 'event': 'message'};
        chunk.split(/\n|\r\n|\r/).forEach(function(line) {
            line = line.trimRight();
            var index = line.indexOf(this.FIELD_SEPARATOR);
            if (index <= 0) {
                // Line was either empty, or started with a separator and is a comment.
                // Either way, ignore.
                return;
            }

            var field = line.substring(0, index);
            if (!(field in e)) {
                return;
            }

            var value = line.substring(index + 1).trimLeft();
            if (field === 'data') {
                e[field] += value;
            } else {
                e[field] = value;
            }
        }.bind(this));

        var event = new CustomSSEEvent(e.event);
        event.data = e.data;
        event.id = e.id;
        return event;
    };

    _checkStreamClosed() {
        if (!this.xhr) {
            return;
        }

        if (this.xhr.readyState === XMLHttpRequest.DONE) {
            this._setReadyState(this.CLOSED);
        }
    };

    stream() {
        this._setReadyState(this.CONNECTING);

        this.xhr = new XMLHttpRequest();
        this.xhr.addEventListener('progress', this._onStreamProgress.bind(this));
        this.xhr.addEventListener('load', this._onStreamLoaded.bind(this));
        this.xhr.addEventListener('readystatechange', this._checkStreamClosed.bind(this));
        this.xhr.addEventListener('error', this._onStreamFailure.bind(this));
        this.xhr.addEventListener('abort', this._onStreamAbort.bind(this));
        this.xhr.open(this.method, this.url);
        for (var header in this.headers) {
            this.xhr.setRequestHeader(header, this.headers[header]);
        }
        this.xhr.withCredentials = this.withCredentials;
        this.xhr.send(this.payload);
    };

    close() {
        if (this.readyState === this.CLOSED) {
            return;
        }

        this.xhr.abort();
        this.xhr = null;
        this._setReadyState(this.CLOSED);
    };

}
