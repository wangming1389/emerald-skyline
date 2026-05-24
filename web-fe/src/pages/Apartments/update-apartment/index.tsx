"use client";

import { Modal } from "@/components/common/Modal";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useGetApartmentById,
	useUpdateApartment,
} from "@/hooks/data/useApartments";
import { useBlocks } from "@/hooks/data/useBlocks";
import { useResidents } from "@/hooks/data/useResidents";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { RelationshipTypeOptions } from "@/constants/relationshipType";
import { ApartmentTypeOptions } from "@/constants/apartmentType";
interface UpdateModalProps {
	open: boolean;
	setOpen: (value: boolean) => void;
	apartmentId?: number | undefined;
}

const UpdateApartmentSchema = z.object({
	roomName: z.string().min(1, "Vui lòng nhập mã căn hộ"),
	type: z.string().min(1, "Vui lòng chọn loại căn hộ"),
	blockId: z.string().min(1, "Vui lòng chọn tòa nhà"),
	floor: z.string().min(1, "Vui lòng chọn tầng"),
	area: z.number().min(1, "Vui lòng nhập diện tích"),
	owner_id: z.string().min(1, "Vui lòng chọn chủ hộ"),
	residents: z.array(
		z.object({
			id: z.number(),
			relationship: z.string(),
		}),
	),
});

type ApartmentFormValues = z.infer<typeof UpdateApartmentSchema>;

const UpdateApartmentModal = ({
	open,
	setOpen,
	apartmentId,
}: UpdateModalProps) => {
	const { data: apartment } = useGetApartmentById(apartmentId!);
	const { data: blocks } = useBlocks();
	const { data: residents = [] } = useResidents();
	const { mutate: updateApartment, isPending } = useUpdateApartment();

	const [selectedResidents, setSelectedResidents] = useState<
		{ id: number; relationship: string }[]
	>([]);

	const form = useForm<ApartmentFormValues>({
		resolver: zodResolver(UpdateApartmentSchema),
		defaultValues: {
			roomName: "",
			type: "",
			floor: "",
			blockId: "",
			area: 0,
			owner_id: "",
			residents: [],
		},
	});

	// Cập nhật giá trị form khi prop `apartment` thay đổi
	useEffect(() => {
		if (apartment && open) {
			// Lấy thông tin từ apartment detail
			let residentsList =
				apartment.residents?.map((r) => ({
					id: r.id,
					relationship: r.relationship,
				})) || [];
			residentsList = residentsList.filter((r) => r.relationship !== "OWNER");
			setSelectedResidents(residentsList);

			const blockId = String(apartment.generalInfo.blockId);
			const floorStr = apartment.generalInfo.floor.toString();

			form.reset({
				roomName: apartment.generalInfo.apartmentName,
				type: apartment.generalInfo.type,
				floor: floorStr,
				blockId: blockId,
				area: parseFloat(apartment.generalInfo.area),
				owner_id: String(apartment.generalInfo.ownerId),
				residents: residentsList,
			});
		}
	}, [apartment, open, form]);

	const selectedBlockId = form.watch("blockId");

	// Cập nhật floor khi blockId thay đổi
	useEffect(() => {
		if (selectedBlockId && form.watch("floor")) {
			// Reset floor nếu nó không thuộc block mới
			const currentFloor = form.watch("floor");
			const selectedBlock = blocks?.find(
				(b) => b.id.toString() === selectedBlockId,
			);
			if (
				selectedBlock &&
				currentFloor &&
				Number(currentFloor) > selectedBlock.totalFloors
			) {
				form.setValue("floor", "");
			}
		}
	}, [selectedBlockId, blocks, form]);

	const buildingOptions = useMemo(
		() =>
			blocks?.map((item) => ({
				value: item.id.toString(),
				label: item.buildingName,
			})) || [],
		[blocks],
	);

	const floorOptions = useMemo(() => {
		if (!selectedBlockId || !blocks) return [];
		const selectedBlock = blocks.find(
			(b) => b.id.toString() === selectedBlockId,
		);
		if (!selectedBlock || !selectedBlock.totalFloors) return [];

		return Array.from({ length: selectedBlock.totalFloors }, (_, i) => ({
			value: (i + 1).toString(),
			label: `Tầng ${i + 1}`,
		}));
	}, [selectedBlockId, blocks]);

	const residentOptions = residents?.map((item) => ({
		value: item.id.toString(),
		label: `${item.fullName} - ${item.citizenId}`,
	}));

	const addResident = (residentId: string) => {
		const id = Number(residentId);
		// Kiểm tra nếu cư dân này đã là chủ hộ
		if (form.watch("owner_id") === residentId) {
			toast.error("Chủ hộ không thể là thành viên cư trú");
			return;
		}
		if (selectedResidents.some((r) => r.id === id)) {
			toast.error("Cư dân đã được thêm");
			return;
		}
		setSelectedResidents([
			...selectedResidents,
			{ id, relationship: "SPOUSE" },
		]);
	};

	const removeResident = (residentId: number) => {
		setSelectedResidents(selectedResidents.filter((r) => r.id !== residentId));
	};

	const updateRelationship = (residentId: number, relationship: string) => {
		setSelectedResidents(
			selectedResidents.map((r) =>
				r.id === residentId ? { ...r, relationship } : r,
			),
		);
	};

	const handleClose = () => {
		setOpen(false);
		form.reset();
		setSelectedResidents([]);
	};

	function onSubmit(values: ApartmentFormValues) {
		if (!apartmentId) return;

		updateApartment(
			{
				id: apartmentId,
				data: {
					roomName: values.roomName,
					type: values.type,
					blockId: Number(values.blockId),
					floor: Number(values.floor),
					area: values.area,
					owner_id: Number(values.owner_id),
					residents: selectedResidents,
				},
			},
			{
				onSuccess: () => {
					toast.success("Cập nhật căn hộ thành công");
					handleClose();
				},
				onError: (error: any) => {
					toast.error(error.response?.data?.message || "Lỗi cập nhật căn hộ");
				},
			},
		);
	}

	return (
		<Modal
			open={open}
			setOpen={setOpen}
			title="Chỉnh sửa căn hộ"
			submitText={isPending ? "Đang lưu..." : "Lưu thay đổi"}
			onSubmit={form.handleSubmit(onSubmit)}
			onLoading={isPending}
		>
			<Form {...form}>
				<form className="space-y-4">
					<div className="grid grid-cols-2 gap-x-4 gap-y-4">
						{/* Mã căn hộ */}
						<FormField
							control={form.control}
							name="roomName"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Mã căn hộ</FormLabel>
									<FormControl>
										<Input placeholder="Nhập mã căn hộ" {...field} />
									</FormControl>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Loại căn hộ */}
						<FormField
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Loại căn hộ</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Chọn loại căn hộ" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{ApartmentTypeOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Tòa nhà */}
						<FormField
							control={form.control}
							name="blockId"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Tòa</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Chọn tòa" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{buildingOptions.map((building) => (
												<SelectItem key={building.value} value={building.value}>
													{building.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Tầng */}
						<FormField
							control={form.control}
							name="floor"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Tầng</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Chọn tầng" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{floorOptions.map((floor) => (
												<SelectItem key={floor.value} value={floor.value}>
													{floor.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Diện tích */}
						<FormField
							control={form.control}
							name="area"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Diện tích (m²)</FormLabel>
									<FormControl>
										<Input
											type="number"
											min="1"
											placeholder="Nhập diện tích"
											value={field.value ?? ""}
											onChange={(e) => field.onChange(Number(e.target.value))}
										/>
									</FormControl>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Chủ hộ */}
						<FormField
							disabled={isPending}
							control={form.control}
							name="owner_id"
							render={({ field }) => {
								const selectedOwner = residentOptions?.find(
									(r) => r.value === field.value,
								);

								return (
									<FormItem className="space-y-1.5">
										<FormLabel isRequired>Chủ hộ</FormLabel>

										<Popover>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														variant="outline"
														role="combobox"
														className="w-full justify-between font-normal"
													>
														{selectedOwner
															? selectedOwner.label
															: "Chọn chủ hộ"}
													</Button>
												</FormControl>
											</PopoverTrigger>

											<PopoverContent className="p-0 w-full">
												<Command>
													<CommandInput placeholder="Tìm chủ hộ..." />
													<CommandList>
														<CommandEmpty>Không tìm thấy cư dân</CommandEmpty>
														<CommandGroup>
															{residentOptions?.map((resident) => (
																<CommandItem
																	key={resident.value}
																	value={resident.label.toLowerCase()}
																	onSelect={() => {
																		field.onChange(resident.value);
																	}}
																>
																	{resident.label}
																	{field.value === resident.value && (
																		<Check className="ml-auto h-4 w-4 opacity-50" />
																	)}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>

										<FormMessage className="text-xs" />
									</FormItem>
								);
							}}
						/>
					</div>

					{/* Cư dân */}
					<div className="space-y-2">
						<Label>Cư dân cư trú</Label>
						<div className="flex gap-2">
							<Select onValueChange={addResident}>
								<SelectTrigger>
									<SelectValue placeholder="Chọn cư dân để thêm" />
								</SelectTrigger>
								<SelectContent>
									{residentOptions?.map((resident) => {
										// Không hiển thị chủ hộ hoặc người đã được thêm rồi
										const isOwner = form.watch("owner_id") === resident.value;
										const isAlreadyAdded = selectedResidents.some(
											(r) => r.id === Number(resident.value),
										);
										if (isOwner || isAlreadyAdded) return null;
										return (
											<SelectItem key={resident.value} value={resident.value}>
												{resident.label}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						{/* Danh sách cư dân đã chọn */}
						{selectedResidents.length > 0 && (
							<div className="space-y-2 mt-3">
								{selectedResidents.map((resident) => {
									const residentInfo = residents.find(
										(r) => r.id === resident.id,
									);
									return (
										<div
											key={resident.id}
											className="flex items-center gap-[10px] "
										>
											<Input
												disabled
												value={`${residentInfo?.fullName} - ${residentInfo?.citizenId}`}
												readOnly
											/>
											<Select
												value={resident.relationship}
												onValueChange={(val) =>
													updateRelationship(resident.id, val)
												}
											>
												<SelectTrigger className="w-40">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{RelationshipTypeOptions.filter(
														(option) =>
															option.value !==
															("OWNER" as "SPOUSE" | "CHILD" | "PARTNER"),
													).map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => removeResident(resident.id)}
											>
												<X className="w-4 h-4" />
											</Button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</form>
			</Form>
		</Modal>
	);
};

export default UpdateApartmentModal;
