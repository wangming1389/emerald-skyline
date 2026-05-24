import { Plus, Printer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionDropdown from "@/components/common/ActionDropdown";
import CustomTable from "@/components/common/CustomTable";
import PageHeader from "@/components/common/PageHeader";
import { SearchBar } from "@/components/common/SearchBar";
import { useResidents } from "@/hooks/data/useResidents";
import CreateResidentModal from "@/pages/Residents/create-resident";
import DeleteResident from "@/pages/Residents/delete-resident";
import DeleteManyResidentModal from "@/pages/Residents/multiple-delete-residents";
import UpdateResidentModal from "@/pages/Residents/update-resident";
import type { ActionOption } from "@/types";
import type { Resident } from "@/types/resident";
import { normalizeString } from "@/utils/string";
import { residentColumns } from "./columns";
import { PrintableResidentList } from "./print";

const ResidentsPage = () => {
	const navigate = useNavigate();
	const [searchTerm, setSearchTerm] = useState("");

	// Resident states
	const [isNewModalOpen, setNewIsModalOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [deletedResident, setDeletedResident] = useState<Resident>();
	const [isUpdateOpen, setIsUpdateOpen] = useState(false);
	const [updatedResident, setUpdatedResident] = useState<number>();

	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [isDeleteManyOpen, setIsDeleteManyOpen] = useState(false);

	// Lấy dữ liệu từ Hooks
	const {
		data: residents = [],
		isLoading: isResidentsLoading,
		isError: isResidentsError,
		error: residentsError,
		refetch: refetchResidents,
	} = useResidents();

	// Logic lọc dữ liệu Residents
	const filteredResidents = useMemo(() => {
		let result = [...residents];

		if (searchTerm.trim()) {
			const search = normalizeString(searchTerm);
			result = result.filter(
				(item) =>
					normalizeString(item.fullName).includes(search) ||
					normalizeString(item.citizenId).includes(search) ||
					normalizeString(item.phoneNumber).includes(search) ||
					normalizeString(item.account.email).includes(search),
			);
		}

		return result;
	}, [residents, searchTerm]);

	// Actions cho Dropdown
	const actions: ActionOption[] = useMemo(
		() => [
			{
				id: "print",
				label: "In danh sách",
				icon: <Printer className="w-4 h-4" />,
				onClick: () => window.print(),
				disabled: residents.length === 0,
			},
		],
		[residents.length],
	);

	return (
		<>
			<PrintableResidentList data={filteredResidents} />
			<div className="p-1.5 pt-0 space-y-4 print:hidden">
				<PageHeader
					title="Cư dân"
					subtitle="Quản lý danh sách cư dân trong tòa nhà"
					actions={
						<div className="flex items-center gap-2">
							{selectedIds.length > 0 ? (
								<button
									onClick={() => setIsDeleteManyOpen(true)}
									className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg hover:bg-destructive/90 transition-colors text-sm font-medium animate-in fade-in zoom-in-95 shadow-sm"
								>
									<Trash2 className="w-4 h-4" />
									Xóa ({selectedIds.length})
								</button>
							) : (
								<button
									onClick={() => setNewIsModalOpen(true)}
									className="flex items-center gap-2 bg-main text-white px-4 py-2 rounded-lg hover:bg-main/90 transition-colors text-sm font-medium"
								>
									<Plus className="w-4 h-4" />
									Tạo cư dân
								</button>
							)}

							<ActionDropdown
								options={actions}
								sampleFileUrl="/template/resident_import_template.xlsx"
							/>
						</div>
					}
				/>

				{/* Khu vực lọc & tìm kiếm */}
				<div className="bg-white p-4 rounded-sm border border-gray-200 shadow-sm space-y-4">
					<SearchBar
						placeholder="Tìm kiếm theo tên, CCCD, số điện thoại, email..."
						onSearch={setSearchTerm}
					/>
				</div>

				{/* Hiển thị nội dung chính */}
				<div className="min-h-[400px]">
					{isResidentsLoading ? (
						<div className="bg-white p-12 text-center text-gray-500 border rounded shadow-sm">
							Đang tải dữ liệu cư dân...
						</div>
					) : isResidentsError ? (
						<div className="bg-red-50 border border-red-200 p-8 rounded text-center space-y-3 text-red-600">
							<p className="font-medium">Không thể tải dữ liệu!</p>
							<p className="text-sm">{(residentsError as Error)?.message}</p>
							<button
								onClick={() => refetchResidents()}
								className="px-4 py-2 bg-red-600 text-white rounded-md text-sm"
							>
								Thử lại ngay
							</button>
						</div>
					) : (
						<CustomTable
							data={filteredResidents}
							columns={residentColumns}
							defaultPageSize={10}
							onSelectionChange={setSelectedIds}
							selection={selectedIds}
							onEdit={(row) => {
								setIsUpdateOpen(true);
								setUpdatedResident((row as Resident).id);
							}}
							onDelete={(row) => {
								setIsDeleteOpen(true);
								setDeletedResident(row as Resident);
							}}
							onView={(row) => {
								console.log(
									"[ViewResidents Debug] onView clicked for row:",
									row.id,
								);
								navigate(`/residents/${row.id}`);
							}}
							// isEditable={(row) => {
							//   const resident = row as Resident;
							//   return !resident.residences || resident.residences.length === 0;
							// }}
						/>
					)}
				</div>
			</div>

			{/* Resident Modals */}
			<CreateResidentModal open={isNewModalOpen} setOpen={setNewIsModalOpen} />
			<DeleteResident
				selectedResident={deletedResident}
				open={isDeleteOpen}
				setOpen={setIsDeleteOpen}
			/>
			<UpdateResidentModal
				open={isUpdateOpen}
				setOpen={setIsUpdateOpen}
				residentId={updatedResident!}
			/>
			<DeleteManyResidentModal
				open={isDeleteManyOpen}
				setOpen={setIsDeleteManyOpen}
				selectedIds={selectedIds}
				onSuccess={() => setSelectedIds([])}
			/>
		</>
	);
};

export default ResidentsPage;
