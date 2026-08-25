export type RuntimeFailureKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "server"
  | "protocol"
  | "request";

export class RuntimeRequestError extends Error {
  constructor(
    message: string,
    readonly kind: RuntimeFailureKind,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RuntimeRequestError";
  }
}

export type RuntimeFailure = {
  kind: RuntimeFailureKind;
  title: string;
  detail: string;
  action: string;
  technicalDetail: string;
};

export function runtimeFailureFromError(error: unknown, baseUrl: string): RuntimeFailure {
  const endpoint = displayEndpoint(baseUrl);
  if (error instanceof RuntimeRequestError) {
    const technicalDetail = [error.code, error.status ? `HTTP ${error.status}` : ""].filter(Boolean).join(" / ");
    if (error.kind === "timeout") {
      return {
        kind: error.kind,
        title: "Run Server 响应超时",
        detail: `${endpoint} 在规定时间内没有响应。服务可能尚未启动，或当前网络无法到达它。`,
        action: "检查 Relay 与 Run Server 进程是否正在运行。",
        technicalDetail: technicalDetail || "CONNECTION_TIMEOUT",
      };
    }
    if (error.kind === "network") {
      return {
        kind: error.kind,
        title: "无法到达 Run Server",
        detail: `浏览器无法与 ${endpoint} 建立连接。地址、端口或局域网连接可能不可用。`,
        action: "确认设备与服务在同一网络，并检查服务地址。",
        technicalDetail: technicalDetail || "NETWORK_UNREACHABLE",
      };
    }
    if (error.kind === "unauthorized" || error.kind === "forbidden") {
      return {
        kind: error.kind,
        title: error.kind === "unauthorized" ? "连接凭证无效" : "当前凭证没有访问权限",
        detail: `Run Server 已响应，但拒绝了来自 ${endpoint} 的请求。`,
        action: "在连接设置中更新 Access Token 后重试。",
        technicalDetail: technicalDetail || error.message,
      };
    }
    if (error.kind === "not-found") {
      return {
        kind: error.kind,
        title: "Runtime 接口不可用",
        detail: `${endpoint} 可以访问，但没有提供当前版本需要的 Runtime 接口。`,
        action: "确认 Run Server 地址与部署版本是否匹配。",
        technicalDetail: technicalDetail || error.message,
      };
    }
    if (error.kind === "server") {
      return {
        kind: error.kind,
        title: "Run Server 内部异常",
        detail: `${endpoint} 已连接，但服务端处理请求时发生错误。`,
        action: "查看 Run Server 日志，服务恢复后页面会自动重连。",
        technicalDetail: technicalDetail || error.message,
      };
    }
    if (error.kind === "protocol") {
      return {
        kind: error.kind,
        title: "Runtime 响应格式异常",
        detail: `${endpoint} 返回了页面无法识别的数据。`,
        action: "确认 Mobile Web 与 Run Server 使用兼容版本。",
        technicalDetail: technicalDetail || error.message,
      };
    }
    return {
      kind: error.kind,
      title: "Runtime 请求失败",
      detail: error.message,
      action: "检查连接设置后重新尝试。",
      technicalDetail: technicalDetail || error.message,
    };
  }

  return {
    kind: "request",
    title: "Runtime 请求失败",
    detail: error instanceof Error ? error.message : "发生未知连接错误。",
    action: "检查连接设置后重新尝试。",
    technicalDetail: error instanceof Error ? error.name : "UNKNOWN_ERROR",
  };
}

function displayEndpoint(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.host;
  } catch {
    return baseUrl || "当前服务地址";
  }
}
