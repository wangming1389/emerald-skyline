"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ApartmentTypeOptions } from "@/constants/apartmentType";
import { RelationshipTypeOptions } from "@/constants/relationshipType";
import { useCreateApartment } from "@/hooks/data/useApartments";
import { useBlocks } from "@/hooks/data/useBlocks";
import { useResidents } from "@/hooks/data/useResidents";

interface ModalProps {
	open: boolean;
	setOpen: (value: boolean) => void;
}
// 1. Schema với thông báo lỗi thân thiện
const CreateApartmentSchema = z.object({
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

type ApartmentFormValues = z.infer<typeof CreateApartmentSchema>;

const CreateApartmentModal = ({ open, setOpen }: ModalProps) => {
	const { data: blocks } = useBlocks();
	const { data: residents = [] } = useResidents();
	const { mutate: createApartment, isPending } = useCreateApartment();

	const [selectedResidents, setSelectedResidents] = useState<
		{ id: number; relationship: string }[]
	>([]);

	const form = useForm<ApartmentFormValues>({
		resolver: zodResolver(CreateApartmentSchema),
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

	// 1. Theo dõi giá trị blockId đã chọn
	const selectedBlockId = form.watch("blockId");

	// 2. Tạo buildingOptions
	const buildingOptions =
		blocks?.map((item) => ({
			value: item.id.toString(),
			label: item.buildingName,
		})) || [];

	// 3. Logic lấy floorOptions dựa trên block được chọn
	const floorOptions = useMemo(() => {
		if (!selectedBlockId || !blocks) return [];

		// Tìm tòa nhà đang được chọn trong danh sách blocks
		const selectedBlock = blocks.find(
			(b) => b.id.toString() === selectedBlockId,
		);

		if (!selectedBlock || !selectedBlock.totalFloors) return [];

		// Tạo mảng từ 1 đến số tầng của tòa nhà đó
		return Array.from({ length: selectedBlock.totalFloors }, (_, i) => ({
			value: (i + 1).toString(),
			label: `Tầng ${i + 1}`,
		}));
	}, [selectedBlockId, blocks]);

	// Reset tầng về rỗng nếu đổi tòa nhà
	useEffect(() => {
		form.setValue("floor", "");
	}, [selectedBlockId, form]);

	const residentOptions = residents?.map((item) => ({
		value: item.id.toString(),
		label: `${item.fullName} - ${item.citizenId}`,
	}));
	console.log(
		"[CreateApartmentModal Debug] residents length:",
		residents?.length,
		"options:",
		JSON.stringify(residentOptions),
	);

	const addResident = (residentId: string) => {
		const id = Number(residentId);
		if (selectedResidents.some((r) => r.id === id)) {
			toast.error("Cư dân đã được thêm");
			return;
		}
		setSelectedResidents([
			...selectedResidents,
			{ id, relationship: "MEMBER" },
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

	function onSubmit(values: ApartmentFormValues) {
		createApartment(
			{
				roomName: values.roomName,
				type: values.type,
				blockId: Number(values.blockId),
				floor: Number(values.floor),
				area: values.area,
				owner_id: Number(values.owner_id),
				residents: selectedResidents,
			},
			{
				onSuccess: () => {
					toast.success("Căn hộ đã được tạo thành công");
					handleClose();
				},
				onError: (error: any) => {
					toast.error(error.response?.data?.message || "Lỗi khi tạo căn hộ");
				},
			},
		);
	}

	const handleClose = () => {
		setOpen(false);
		form.reset();
		setSelectedResidents([]);
	};
	return (
		<Modal
			open={open}
			setOpen={setOpen}
			title="Tạo căn hộ mới"
			submitText="Tạo mới"
			onLoading={isPending}
			// Kích hoạt submit qua hook form
			onSubmit={form.handleSubmit(onSubmit)}
		>
			<Form {...form}>
				<form className="space-y-4">
					<div className="grid grid-cols-2 gap-x-4 gap-y-4">
						{/* Mã căn hộ */}
						<FormField
							disabled={isPending}
							control={form.control}
							name="roomName"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Mã căn hộ</FormLabel>
									<FormControl>
										<Input
											placeholder="Nhập mã căn hộ (VD: A.12-01)"
											{...field}
										/>
									</FormControl>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

						{/* Loại căn hộ */}
						<FormField
							disabled={isPending}
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Loại căn hộ</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
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
							disabled={isPending}
							control={form.control}
							name="blockId"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Tòa</FormLabel>
									<Select onValueChange={field.onChange}>
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
							disabled={isPending}
							control={form.control}
							name="floor"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Tầng</FormLabel>
									<Select onValueChange={field.onChange}>
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
							disabled={isPending}
							control={form.control}
							name="area"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel isRequired>Diện tích (m²)</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder="Nhập diện tích"
											value={field.value ?? ""}
											onChange={(e) => field.onChange(Number(e.target.value))}
										/>
									</FormControl>
									<FormMessage className="text-xs" />
								</FormItem>
							)}
						/>

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
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-between font-normal"
									>
										Chọn cư dân để thêm
									</Button>
								</PopoverTrigger>
								<PopoverContent className="p-0 w-full">
									<Command>
										<CommandInput placeholder="Tìm cư dân..." />
										<CommandList>
											<CommandEmpty>Không tìm thấy cư dân</CommandEmpty>
											<CommandGroup>
												{residentOptions?.map((resident) => (
													<CommandItem
														key={resident.value}
														value={resident.label}
														onSelect={() => addResident(resident.value)}
													>
														{resident.label}
														{selectedResidents.some(
															(r) => r.id.toString() === resident.value,
														) && (
															<Check className="ml-auto h-4 w-4 opacity-50" />
														)}
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
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
											className="flex items-center gap-[10px]  "
										>
											<Input
												disabled
												value={`${residentInfo?.fullName} - ${residentInfo?.citizenId}`}
												readOnly
												className="flex items-center gap-[10px] "
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
													{RelationshipTypeOptions.map((option) => (
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

export default CreateApartmentModal;
