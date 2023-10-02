import { type ReactNode } from "react";
import Box from "@mui/system/Box";
import { type SystemStyleObject } from "@mui/system";

type Props = {
  children: ReactNode;
  height?: number;
  maxHeight?: number;
  sx?: SystemStyleObject;
};

export function OverflowY({ children, height, maxHeight, sx }: Props) {
  const computedHeight = height === undefined ? "100%" : `${height}px`;

  // Doing Math.max check to catch cases where height is accidentally larger
  // than maxHeight
  const computedMaxHeight =
    maxHeight === undefined
      ? computedHeight
      : `${Math.max(height ?? 0, maxHeight)}px`;

  return (
    <Box
      sx={{
        width: "100%",
        height: computedHeight,
        maxHeight: computedMaxHeight,
        overflowY: "auto",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
