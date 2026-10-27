import { API_V1 } from "@/lib/config"
import { apiRequest } from "@/api/http"
import type {
  ChannelBindOption,
  ChannelItem,
  ChannelQrcodeDetail,
  ChannelQrcodePollBody,
  ChannelType,
  ChannelWriteBody,
} from "@/lib/types"

export function listChannels() {
  return apiRequest<ChannelItem[]>("/channels/all")
}

export function listChannelBindOptions() {
  return apiRequest<ChannelBindOption[]>("/channels/bind-options")
}

export function generateChannelQrcode(channelType: ChannelType) {
  return apiRequest<ChannelQrcodeDetail>(`/channels/qrcode/${channelType}`, {
    method: "POST",
  })
}

export function pollChannelQrcode(
  channelType: ChannelType,
  body: ChannelQrcodePollBody
) {
  return apiRequest<ChannelQrcodeDetail>(
    `/channels/qrcode/${channelType}/poll`,
    {
      method: "POST",
      body: JSON.stringify(body),
      silent: true,
    }
  )
}

export function cancelChannelQrcode(
  channelType: ChannelType,
  body: ChannelQrcodePollBody
) {
  return apiRequest<null>(`/channels/qrcode/${channelType}/cancel`, {
    method: "POST",
    body: JSON.stringify(body),
    silent: true,
  })
}

export function createChannel(body: ChannelWriteBody) {
  return apiRequest<null>("/channels", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateChannel(pk: number, body: ChannelWriteBody) {
  return apiRequest<null>(`/channels/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteChannel(pk: number) {
  return apiRequest<null>(`/channels/${pk}`, { method: "DELETE" })
}

export function channelInboundUrl(pk: number) {
  return `${API_V1}/channels/${pk}/inbound`
}
