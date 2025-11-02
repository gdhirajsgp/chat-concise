import { useIsMobile } from "./use-mobile";
import { Capacitor } from "@capacitor/core";

export interface DeviceType {
  isMobile: boolean;
  isNative: boolean;
  isDesktop: boolean;
}

export function useDeviceType(): DeviceType {
  const isMobile = useIsMobile();
  const isNative = Capacitor.isNativePlatform();
  const isDesktop = !isMobile && !isNative;

  return {
    isMobile,
    isNative,
    isDesktop,
  };
}
