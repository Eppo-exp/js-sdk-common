/** Listener interface for network status changes */
export default interface NetworkStatusListener {
  /** Returns true if the network is offline */
  isOffline(): boolean;

  /** Calls the provided callback when the network status changes */
  onNetworkStatusChange(callback: (isOffline: boolean) => void): void;
}
