import { Template, Workspace } from "api/typesGenerated";
import { PaginationWidgetBase } from "components/PaginationWidget/PaginationWidgetBase";
import { ComponentProps, FC } from "react";
import { Margins } from "components/Margins/Margins";
import { PageHeader, PageHeaderTitle } from "components/PageHeader/PageHeader";
import { Stack } from "components/Stack/Stack";
import { WorkspaceHelpTooltip } from "./WorkspaceHelpTooltip";
import { WorkspacesTable } from "pages/WorkspacesPage/WorkspacesTable";
import { useLocalStorage } from "hooks";
import { DormantWorkspaceBanner, Count } from "components/WorkspaceDeletion";
import { ErrorAlert } from "components/Alert/ErrorAlert";
import { WorkspacesFilter } from "./filter/filter";
import { hasError, isApiValidationError } from "api/errors";
import {
  PaginationStatus,
  TableToolbar,
} from "components/TableToolbar/TableToolbar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { WorkspacesButton } from "./WorkspacesButton";
import { UseQueryResult } from "react-query";

export const Language = {
  pageTitle: "Workspaces",
  yourWorkspacesButton: "Your workspaces",
  allWorkspacesButton: "All workspaces",
  runningWorkspacesButton: "Running workspaces",
  createWorkspace: <>Create Workspace&hellip;</>,
  seeAllTemplates: "See all templates",
  template: "Template",
};

type TemplateQuery = UseQueryResult<Template[]>;

export interface WorkspacesPageViewProps {
  error: unknown;
  workspaces?: Workspace[];
  dormantWorkspaces?: Workspace[];
  checkedWorkspaces: Workspace[];
  count?: number;
  filterProps: ComponentProps<typeof WorkspacesFilter>;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onUpdateWorkspace: (workspace: Workspace) => void;
  onCheckChange: (checkedWorkspaces: Workspace[]) => void;
  onDeleteAll: () => void;
  canCheckWorkspaces: boolean;

  templatesFetchStatus: TemplateQuery["status"];
  templates: TemplateQuery["data"];
}

export const WorkspacesPageView: FC<
  React.PropsWithChildren<WorkspacesPageViewProps>
> = ({
  workspaces,
  dormantWorkspaces,
  error,
  limit,
  count,
  filterProps,
  onPageChange,
  onUpdateWorkspace,
  page,
  checkedWorkspaces,
  onCheckChange,
  onDeleteAll,
  canCheckWorkspaces,
  templates,
  templatesFetchStatus,
}) => {
  const { saveLocal } = useLocalStorage();

  const workspacesDeletionScheduled = dormantWorkspaces
    ?.filter((workspace) => workspace.deleting_at)
    .map((workspace) => workspace.id);

  const hasDormantWorkspace =
    dormantWorkspaces !== undefined && dormantWorkspaces.length > 0;

  return (
    <Margins>
      <PageHeader
        actions={
          <WorkspacesButton
            templates={templates}
            templatesFetchStatus={templatesFetchStatus}
          >
            {Language.createWorkspace}
          </WorkspacesButton>
        }
      >
        <PageHeaderTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>{Language.pageTitle}</span>
            <WorkspaceHelpTooltip />
          </Stack>
        </PageHeaderTitle>
      </PageHeader>

      <Stack>
        {hasError(error) && !isApiValidationError(error) && (
          <ErrorAlert error={error} />
        )}
        {/* <DormantWorkspaceBanner/> determines its own visibility */}
        <DormantWorkspaceBanner
          workspaces={dormantWorkspaces}
          shouldRedisplayBanner={hasDormantWorkspace}
          onDismiss={() =>
            saveLocal(
              "dismissedWorkspaceList",
              JSON.stringify(workspacesDeletionScheduled),
            )
          }
          count={Count.Multiple}
        />

        <WorkspacesFilter error={error} {...filterProps} />
      </Stack>

      <TableToolbar>
        {checkedWorkspaces.length > 0 ? (
          <>
            <Box>
              Selected <strong>{checkedWorkspaces.length}</strong> of{" "}
              <strong>{workspaces?.length}</strong>{" "}
              {workspaces?.length === 1 ? "workspace" : "workspaces"}
            </Box>

            <Box sx={{ marginLeft: "auto" }}>
              <Button
                size="small"
                startIcon={<DeleteOutlined />}
                onClick={onDeleteAll}
              >
                Delete selected
              </Button>
            </Box>
          </>
        ) : (
          <PaginationStatus
            isLoading={!workspaces && !error}
            showing={workspaces?.length ?? 0}
            total={count ?? 0}
            label="workspaces"
          />
        )}
      </TableToolbar>

      <WorkspacesTable
        workspaces={workspaces}
        isUsingFilter={filterProps.filter.used}
        onUpdateWorkspace={onUpdateWorkspace}
        checkedWorkspaces={checkedWorkspaces}
        onCheckChange={onCheckChange}
        canCheckWorkspaces={canCheckWorkspaces}
      />
      {count !== undefined && (
        <PaginationWidgetBase
          count={count}
          limit={limit}
          onChange={onPageChange}
          page={page}
        />
      )}
    </Margins>
  );
};
