import EventEmitter from "eventemitter3";
import SturdyWebSocket from "sturdy-websocket";
import {
  isSubscriptionEvent,
  JsonRpcRequest,
  WebSocketMessage,
} from "../types";
import { makePayloadFactory } from "../util/jsonRpc";
import { SendPayloadFunction } from "./sendPayload";

/**
 * This is the undocumented interface required by Web3 for providers which
 * handle subscriptions.
 *
 * In addition to the stated methods here, it communicates subscription events
 * by using EventEmitter#emit() to emit the events, with the appropriate
 * subscription id as the event type.
 */
export interface Web3SubscriptionProvider extends EventEmitter {
  sendPayload: SendPayloadFunction;
  send(method: string, params?: any[]): Promise<any>;
  sendBatch(methods: any[], moduleInstance: any): Promise<any>;
  supportsSubscriptions(): true;
  subscribe(
    subscribeMethod: string,
    subscriptionMethod: string,
    parameters: any[],
  ): Promise<string>;
  unsubscribe(
    subscriptionId: string,
    unsubscribeMethod?: string,
  ): Promise<boolean>;
  disconnect(code?: number, reason?: string): void;
}

interface VirtualSubscription {
  physicalId: string;
  method: string;
  params: any[];
}

export class AlchemyWebSocketProvider extends EventEmitter
  implements Web3SubscriptionProvider {
  // In the case of a WebSocket reconnection, all subscriptions are lost and we
  // create new ones to replace them, but we want to create the illusion that
  // the original subscriptions persist. Thus, maintain a mapping from the
  // "virtual" subscription ids which are visible to the consumer to the
  // "physical" subscription ids of the actual connections. This terminology is
  // borrowed from virtual and physical memory, which has a similar mapping.
  private readonly virtualSubscriptionsById: Map<
    string,
    VirtualSubscription
  > = new Map();
  private readonly virtualIdsByPhysicalId: Map<string, string> = new Map();
  private readonly makePayload = makePayloadFactory();

  constructor(
    private readonly ws: SturdyWebSocket,
    public readonly sendPayload: SendPayloadFunction,
  ) {
    super();
    this.addSocketListeners();
  }

  public supportsSubscriptions(): true {
    return true;
  }

  public async subscribe(
    subscribeMethod: string,
    subscriptionMethod: string,
    parameters: any[],
  ): Promise<string> {
    const method = subscribeMethod;
    const params = [subscriptionMethod, ...parameters];
    const physicalId = await this.send(method, params);
    this.virtualSubscriptionsById.set(physicalId, {
      physicalId,
      method,
      params,
    });
    this.virtualIdsByPhysicalId.set(physicalId, physicalId);
    return physicalId;
  }

  public async unsubscribe(
    subscriptionId: string,
    unsubscribeMethod = "eth_unsubscribe",
  ): Promise<boolean> {
    const virtualSubscription = this.virtualSubscriptionsById.get(
      subscriptionId,
    );
    if (!virtualSubscription) {
      return false;
    }
    const { physicalId } = virtualSubscription;
    const response = await this.send(unsubscribeMethod, [physicalId]);
    this.virtualSubscriptionsById.delete(subscriptionId);
    this.virtualIdsByPhysicalId.delete(physicalId);
    return response;
  }

  public disconnect(code?: number, reason?: string): void {
    this.removeSocketListeners();
    this.removeAllListeners();
    this.ws.close(code, reason);
  }

  public async send(method: string, params: any[]): Promise<any> {
    const response = await this.sendPayload(this.makePayload(method, params));
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  public sendBatch(methods: any[], moduleInstance: any): Promise<any> {
    const payload: JsonRpcRequest[] = [];
    methods.forEach(method => {
      method.beforeExecution(moduleInstance);
      payload.push(this.makePayload(method.rpcMethod, method.parameters));
    });
    return this.sendPayload(payload);
  }

  private addSocketListeners(): void {
    this.ws.addEventListener("message", this.handleMessage);
    this.ws.addEventListener("reopen", this.handleReopen);
  }

  private removeSocketListeners(): void {
    this.ws.removeEventListener("message", this.handleMessage);
    this.ws.removeEventListener("reopen", this.handleReopen);
  }

  private handleMessage = (event: MessageEvent): void => {
    const message: WebSocketMessage = JSON.parse(event.data);
    if (!isSubscriptionEvent(message)) {
      return;
    }
    const { subscription } = message.params;
    const virtualId = this.virtualIdsByPhysicalId.get(subscription);
    if (virtualId) {
      this.emit(virtualId, message.params);
    }
  };

  private handleReopen = async (): Promise<void> => {
    this.virtualIdsByPhysicalId.clear();
    for (const [
      virtualId,
      virtualSubscription,
    ] of this.virtualSubscriptionsById.entries()) {
      const { method, params } = virtualSubscription;
      const physicalId = await this.send(method, params);
      virtualSubscription.physicalId = physicalId;
      this.virtualIdsByPhysicalId.set(physicalId, virtualId);
    }
  };
}
