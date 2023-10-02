import { type ReactNode } from "react";
import Box from "@mui/system/Box";

type Props = {
  children: ReactNode;
  height?: number;
  maxHeight?: number;
  minHeight?: number;
};

export function OverflowY({
  children,
  height = 400,
  minHeight = height,
  maxHeight = height,
}: Props) {
  // Component should only reference min/max heights in implementation
  return (
    <Box
      sx={{
        width: "100%",
        height: `${height}px`,
        overflowY: "auto",
      }}
    >
      {children}
    </Box>
  );
}
