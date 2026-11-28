void __cpuid(int registers[4], int leaf);
#pragma intrinsic(__cpuid)

__declspec(dllimport) void __stdcall ExitProcess(unsigned int exit_code);

void __stdcall CheckCpu(void) {
	int registers[4];
	__cpuid(registers, 0);
	if (registers[0] < 1) {
		ExitProcess(1);
		return;
	}
	__cpuid(registers, 1);
	/* CPUID leaf 1, ECX bit 19 is SSE4.1. */
	ExitProcess((registers[2] & (1 << 19)) != 0 ? 0 : 1);
}
