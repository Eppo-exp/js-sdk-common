type Event = {
  uuid: string;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
};

export default Event;
