export type ValueType = string | number | boolean | JSON;
export type AttributeType = string | number | boolean;
export type ConditionValueType = AttributeType | AttributeType[];
export type Attributes = Record<string, AttributeType>;
export type ContextAttributes = {
  numericAttributes: Attributes;
  categoricalAttributes: Attributes;
};
export type BanditSubjectAttributes = Attributes | ContextAttributes;
export type BanditActions =
  | string[]
  | Record<string, Attributes>
  | Record<string, ContextAttributes>;
export type Base64String = string;
export type MD5String = string;
