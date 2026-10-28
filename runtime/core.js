// TESL-REBORN-ANDROID-CORE v1
// Private, bounded diagnostics. No IL2CPP or Android UI is needed to write.
function createPortLog(io, redact) {
  const limit = 128 * 1024;
  function bytes(text) {
    let size = 0;
    for (const char of text) {
      const point = char.codePointAt(0);
      size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    }
    return size;
  }
  let size = 0;
  let windowStarted = Date.now(), messages = 0;
  try { io.rotate(); } catch (_) {}
  return message => {
    try {
      const now = Date.now();
      if (now - windowStarted >= 1000) { windowStarted = now; messages = 0; }
      if (++messages > 80) return; // A repeated Unity warning must not saturate storage.
      // Never persist request bodies, even when the normal debug log has them.
      const safe = redact(String(message))
        .replace(/\bbody:\s*[\s\S]*/i, 'body: [omitted]')
        .replace(/(auto login as )[^\r\n]*/i, '$1[omitted]');
      const line = new Date().toISOString() + ' ' + safe.slice(0, 6000) + '\n';
      const length = bytes(line);
      if (size + length > limit) { io.rotate(); size = 0; }
      io.append(line); size += length;
    } catch (_) { /* Full/unavailable storage must never prevent playing. */ }
  };
}

function createNativePortLog(redact) {
  const libc = Process.getModuleByName('libc.so');
  const uid = new NativeFunction(libc.getExportByName('getuid'), 'uint', [])();
  const directory = `/data/user/${Math.floor(uid / 100000)}/com.bethsoft.theelderscrollslegends/files/tesl-reborn-logs`;
  const mkdir = new NativeFunction(libc.getExportByName('mkdir'), 'int', ['pointer','uint']);
  const rename = new NativeFunction(libc.getExportByName('rename'), 'int', ['pointer','pointer']);
  mkdir(Memory.allocUtf8String(directory), 0o700);
  const move = (from, to) => rename(Memory.allocUtf8String(directory + '/' + from), Memory.allocUtf8String(directory + '/' + to));
  return createPortLog({
    rotate() {
      for (let i=9;i>=4;i--) move(`previous-${i-1}.log`,`previous-${i}.log`);
      move('older.log','previous-3.log');
      move('previous.log','older.log'); move('current.log','previous.log');
    },
    append(text) {
      const file = new File(directory + '/current.log', 'ab');
      try { file.write(text); file.flush(); } finally { file.close(); }
    }
  }, redact);
}

// node_modules/frida-il2cpp-bridge/dist/index.js
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.application = {
    /**
     * Gets the data path name of the current application, e.g.
     * `/data/emulated/0/Android/data/com.example.application/files`
     * on Android.
     *
     * **This information is not guaranteed to exist.**
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints /data/emulated/0/Android/data/com.example.application/files
     *     console.log(Il2Cpp.application.dataPath);
     * });
     * ```
     */
    get dataPath() {
      return unityEngineCall("get_persistentDataPath");
    },
    /**
     * Gets the identifier name of the current application, e.g.
     * `com.example.application` on Android.
     *
     * In case the identifier cannot be retrieved, the main module name is
     * returned instead, which typically is the process name.
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints com.example.application
     *     console.log(Il2Cpp.application.identifier);
     * });
     * ```
     */
    get identifier() {
      return unityEngineCall("get_identifier") ?? unityEngineCall("get_bundleIdentifier") ?? Process.mainModule.name;
    },
    /**
     * Gets the version name of the current application, e.g. `4.12.8`.
     *
     * In case the version cannot be retrieved, an hash of the IL2CPP
     * module is returned instead.
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints 4.12.8
     *     console.log(Il2Cpp.application.version);
     * });
     * ```
     */
    get version() {
      return unityEngineCall("get_version") ?? Il2Cpp3.module.enumerateSections().reduce((checksum, section2) => {
        return [".text", "__text"].includes(section2.name) ? checksum.update(ArrayBuffer.wrap(section2.address, section2.size)) : checksum;
      }, new Checksum("md5")).getString();
    }
  };
  getter(Il2Cpp3, "unityVersion", () => {
    try {
      const unityVersion = Il2Cpp3.$config.unityVersion ?? unityEngineCall("get_unityVersion");
      if (unityVersion != null) {
        return unityVersion;
      }
    } catch (_) {
    }
    const rangeProvider = function* () {
      yield* Il2Cpp3.module.enumerateSections().filter((_) => _.name == ".rodata" || _.name == ".rdata" || _.name == "__TEXT").map((_) => ({ base: _.address, size: _.size }));
      yield* Il2Cpp3.module.enumerateRanges("r--");
      yield* Process.enumerateRanges("r--").filter((_) => _.file != void 0 && _.file.path != Il2Cpp3.module.path);
    };
    for (const range of rangeProvider()) {
      let matches;
      try {
        matches = Memory.scanSync(range.base, range.size, "69 6c 32 63 70 70");
      } catch (_) {
        continue;
      }
      for (let { address } of matches) {
        while (address.readU8() != 0) {
          address = address.sub(1);
        }
        const match = UnityVersion.find(address.add(1).readCString());
        if (match != void 0) {
          return match;
        }
      }
    }
    raise("couldn't determine the Unity version, please specify it manually");
  }, lazy);
  function unityEngineCall(method) {
    const icallHandle = Il2Cpp3.exports.resolveInternalCall(Memory.allocUtf8String("UnityEngine.Application::" + method));
    return (icallHandle.isNull() ? Il2Cpp3.domain.tryAssembly("UnityEngine.CoreModule")?.image?.tryClass("UnityEngine.Application")?.tryMethod(method)?.invoke() : new Il2Cpp3.String(new NativeFunction(icallHandle, "pointer", [])()))?.asNullable()?.content ?? null;
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function boxed(value, type) {
    const mapping = {
      int8: "System.SByte",
      uint8: "System.Byte",
      int16: "System.Int16",
      uint16: "System.UInt16",
      int32: "System.Int32",
      uint32: "System.UInt32",
      int64: "System.Int64",
      uint64: "System.UInt64",
      char: "System.Char",
      intptr: "System.IntPtr",
      uintptr: "System.UIntPtr"
    };
    const className = typeof value == "boolean" ? "System.Boolean" : typeof value == "number" ? mapping[type ?? "int32"] : value instanceof Int64 ? "System.Int64" : value instanceof UInt64 ? "System.UInt64" : value instanceof NativePointer ? mapping[type ?? "intptr"] : raise(`Cannot create boxed primitive using value of type '${typeof value}'`);
    const object = Il2Cpp3.corlib.class(className ?? raise(`Unknown primitive type name '${type}'`)).alloc();
    (object.tryField("m_value") ?? object.tryField("_pointer") ?? raise(`Could not find primitive field in class '${className}'`)).value = value;
    return object;
  }
  Il2Cpp3.boxed = boxed;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.$config = {
    moduleName: void 0,
    unityVersion: void 0,
    exports: void 0
  };
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function installExceptionListener(targetThread = "current") {
    const currentThread = Il2Cpp3.exports.threadGetCurrent();
    return Interceptor.attach(Il2Cpp3.module.getExportByName("__cxa_throw"), function(args) {
      if (targetThread == "current" && !Il2Cpp3.exports.threadGetCurrent().equals(currentThread)) {
        return;
      }
      inform(new Il2Cpp3.Object(args[0].readPointer()));
    });
  }
  Il2Cpp3.installExceptionListener = installExceptionListener;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.exports = {
    get alloc() {
      return r("il2cpp_alloc", "pointer", ["size_t"]);
    },
    get arrayGetLength() {
      return r("il2cpp_array_length", "uint32", ["pointer"]);
    },
    get arrayNew() {
      return r("il2cpp_array_new", "pointer", ["pointer", "uint32"]);
    },
    get assemblyGetImage() {
      return r("il2cpp_assembly_get_image", "pointer", ["pointer"]);
    },
    get classForEach() {
      return r("il2cpp_class_for_each", "void", ["pointer", "pointer"]);
    },
    get classFromName() {
      return r("il2cpp_class_from_name", "pointer", ["pointer", "pointer", "pointer"]);
    },
    get classFromObject() {
      return r("il2cpp_class_from_system_type", "pointer", ["pointer"]);
    },
    get classGetArrayClass() {
      return r("il2cpp_array_class_get", "pointer", ["pointer", "uint32"]);
    },
    get classGetArrayElementSize() {
      return r("il2cpp_class_array_element_size", "int", ["pointer"]);
    },
    get classGetAssemblyName() {
      return r("il2cpp_class_get_assemblyname", "pointer", ["pointer"]);
    },
    get classGetBaseType() {
      return r("il2cpp_class_enum_basetype", "pointer", ["pointer"]);
    },
    get classGetDeclaringType() {
      return r("il2cpp_class_get_declaring_type", "pointer", ["pointer"]);
    },
    get classGetElementClass() {
      return r("il2cpp_class_get_element_class", "pointer", ["pointer"]);
    },
    get classGetFieldFromName() {
      return r("il2cpp_class_get_field_from_name", "pointer", ["pointer", "pointer"]);
    },
    get classGetFields() {
      return r("il2cpp_class_get_fields", "pointer", ["pointer", "pointer"]);
    },
    get classGetFlags() {
      return r("il2cpp_class_get_flags", "int", ["pointer"]);
    },
    get classGetImage() {
      return r("il2cpp_class_get_image", "pointer", ["pointer"]);
    },
    get classGetInstanceSize() {
      return r("il2cpp_class_instance_size", "int32", ["pointer"]);
    },
    get classGetInterfaces() {
      return r("il2cpp_class_get_interfaces", "pointer", ["pointer", "pointer"]);
    },
    get classGetMethodFromName() {
      return r("il2cpp_class_get_method_from_name", "pointer", ["pointer", "pointer", "int"]);
    },
    get classGetMethods() {
      return r("il2cpp_class_get_methods", "pointer", ["pointer", "pointer"]);
    },
    get classGetName() {
      return r("il2cpp_class_get_name", "pointer", ["pointer"]);
    },
    get classGetNamespace() {
      return r("il2cpp_class_get_namespace", "pointer", ["pointer"]);
    },
    get classGetNestedClasses() {
      return r("il2cpp_class_get_nested_types", "pointer", ["pointer", "pointer"]);
    },
    get classGetParent() {
      return r("il2cpp_class_get_parent", "pointer", ["pointer"]);
    },
    get classGetStaticFieldData() {
      return r("il2cpp_class_get_static_field_data", "pointer", ["pointer"]);
    },
    get classGetValueTypeSize() {
      return r("il2cpp_class_value_size", "int32", ["pointer", "pointer"]);
    },
    get classGetType() {
      return r("il2cpp_class_get_type", "pointer", ["pointer"]);
    },
    get classHasReferences() {
      return r("il2cpp_class_has_references", "bool", ["pointer"]);
    },
    get classInitialize() {
      return r("il2cpp_runtime_class_init", "void", ["pointer"]);
    },
    get classIsAbstract() {
      return r("il2cpp_class_is_abstract", "bool", ["pointer"]);
    },
    get classIsAssignableFrom() {
      return r("il2cpp_class_is_assignable_from", "bool", ["pointer", "pointer"]);
    },
    get classIsBlittable() {
      return r("il2cpp_class_is_blittable", "bool", ["pointer"]);
    },
    get classIsEnum() {
      return r("il2cpp_class_is_enum", "bool", ["pointer"]);
    },
    get classIsGeneric() {
      return r("il2cpp_class_is_generic", "bool", ["pointer"]);
    },
    get classIsInflated() {
      return r("il2cpp_class_is_inflated", "bool", ["pointer"]);
    },
    get classIsInterface() {
      return r("il2cpp_class_is_interface", "bool", ["pointer"]);
    },
    get classIsSubclassOf() {
      return r("il2cpp_class_is_subclass_of", "bool", ["pointer", "pointer", "bool"]);
    },
    get classIsValueType() {
      return r("il2cpp_class_is_valuetype", "bool", ["pointer"]);
    },
    get domainGetAssemblyFromName() {
      return r("il2cpp_domain_assembly_open", "pointer", ["pointer", "pointer"]);
    },
    get domainGet() {
      return r("il2cpp_domain_get", "pointer", []);
    },
    get domainGetAssemblies() {
      return r("il2cpp_domain_get_assemblies", "pointer", ["pointer", "pointer"]);
    },
    get fieldGetClass() {
      return r("il2cpp_field_get_parent", "pointer", ["pointer"]);
    },
    get fieldGetFlags() {
      return r("il2cpp_field_get_flags", "int", ["pointer"]);
    },
    get fieldGetName() {
      return r("il2cpp_field_get_name", "pointer", ["pointer"]);
    },
    get fieldGetOffset() {
      return r("il2cpp_field_get_offset", "int32", ["pointer"]);
    },
    get fieldGetStaticValue() {
      return r("il2cpp_field_static_get_value", "void", ["pointer", "pointer"]);
    },
    get fieldGetType() {
      return r("il2cpp_field_get_type", "pointer", ["pointer"]);
    },
    get fieldSetStaticValue() {
      return r("il2cpp_field_static_set_value", "void", ["pointer", "pointer"]);
    },
    get free() {
      return r("il2cpp_free", "void", ["pointer"]);
    },
    get gcCollect() {
      return r("il2cpp_gc_collect", "void", ["int"]);
    },
    get gcCollectALittle() {
      return r("il2cpp_gc_collect_a_little", "void", []);
    },
    get gcDisable() {
      return r("il2cpp_gc_disable", "void", []);
    },
    get gcEnable() {
      return r("il2cpp_gc_enable", "void", []);
    },
    get gcForEachHeap() {
      return r("il2cpp_gc_foreach_heap", "void", ["pointer", "pointer"]);
    },
    get gcGetHeapSize() {
      return r("il2cpp_gc_get_heap_size", "int64", []);
    },
    get gcGetMaxTimeSlice() {
      return r("il2cpp_gc_get_max_time_slice_ns", "int64", []);
    },
    get gcGetUsedSize() {
      return r("il2cpp_gc_get_used_size", "int64", []);
    },
    get gcHandleGetTarget() {
      return r("il2cpp_gchandle_get_target", "pointer", ["uint32"]);
    },
    get gcHandleFree() {
      return r("il2cpp_gchandle_free", "void", ["uint32"]);
    },
    get gcHandleNew() {
      return r("il2cpp_gchandle_new", "uint32", ["pointer", "bool"]);
    },
    get gcHandleNewWeakRef() {
      return r("il2cpp_gchandle_new_weakref", "uint32", ["pointer", "bool"]);
    },
    get gcIsDisabled() {
      return r("il2cpp_gc_is_disabled", "bool", []);
    },
    get gcIsIncremental() {
      return r("il2cpp_gc_is_incremental", "bool", []);
    },
    get gcSetMaxTimeSlice() {
      return r("il2cpp_gc_set_max_time_slice_ns", "void", ["int64"]);
    },
    get gcStartIncrementalCollection() {
      return r("il2cpp_gc_start_incremental_collection", "void", []);
    },
    get gcStartWorld() {
      return r("il2cpp_start_gc_world", "void", []);
    },
    get gcStopWorld() {
      return r("il2cpp_stop_gc_world", "void", []);
    },
    get getCorlib() {
      return r("il2cpp_get_corlib", "pointer", []);
    },
    get imageGetAssembly() {
      return r("il2cpp_image_get_assembly", "pointer", ["pointer"]);
    },
    get imageGetClass() {
      return r("il2cpp_image_get_class", "pointer", ["pointer", "uint"]);
    },
    get imageGetClassCount() {
      return r("il2cpp_image_get_class_count", "uint32", ["pointer"]);
    },
    get imageGetName() {
      return r("il2cpp_image_get_name", "pointer", ["pointer"]);
    },
    get initialize() {
      return r("il2cpp_init", "void", ["pointer"]);
    },
    get livenessAllocateStruct() {
      return r("il2cpp_unity_liveness_allocate_struct", "pointer", ["pointer", "int", "pointer", "pointer", "pointer"]);
    },
    get livenessCalculationBegin() {
      return r("il2cpp_unity_liveness_calculation_begin", "pointer", ["pointer", "int", "pointer", "pointer", "pointer", "pointer"]);
    },
    get livenessCalculationEnd() {
      return r("il2cpp_unity_liveness_calculation_end", "void", ["pointer"]);
    },
    get livenessCalculationFromStatics() {
      return r("il2cpp_unity_liveness_calculation_from_statics", "void", ["pointer"]);
    },
    get livenessFinalize() {
      return r("il2cpp_unity_liveness_finalize", "void", ["pointer"]);
    },
    get livenessFreeStruct() {
      return r("il2cpp_unity_liveness_free_struct", "void", ["pointer"]);
    },
    get memorySnapshotCapture() {
      return r("il2cpp_capture_memory_snapshot", "pointer", []);
    },
    get memorySnapshotFree() {
      return r("il2cpp_free_captured_memory_snapshot", "void", ["pointer"]);
    },
    get memorySnapshotGetClasses() {
      return r("il2cpp_memory_snapshot_get_classes", "pointer", ["pointer", "pointer"]);
    },
    get memorySnapshotGetObjects() {
      return r("il2cpp_memory_snapshot_get_objects", "pointer", ["pointer", "pointer"]);
    },
    get methodGetClass() {
      return r("il2cpp_method_get_class", "pointer", ["pointer"]);
    },
    get methodGetFlags() {
      return r("il2cpp_method_get_flags", "uint32", ["pointer", "pointer"]);
    },
    get methodGetName() {
      return r("il2cpp_method_get_name", "pointer", ["pointer"]);
    },
    get methodGetObject() {
      return r("il2cpp_method_get_object", "pointer", ["pointer", "pointer"]);
    },
    get methodGetParameterCount() {
      return r("il2cpp_method_get_param_count", "uint8", ["pointer"]);
    },
    get methodGetParameterName() {
      return r("il2cpp_method_get_param_name", "pointer", ["pointer", "uint32"]);
    },
    get methodGetParameters() {
      return r("il2cpp_method_get_parameters", "pointer", ["pointer", "pointer"]);
    },
    get methodGetParameterType() {
      return r("il2cpp_method_get_param", "pointer", ["pointer", "uint32"]);
    },
    get methodGetReturnType() {
      return r("il2cpp_method_get_return_type", "pointer", ["pointer"]);
    },
    get methodIsGeneric() {
      return r("il2cpp_method_is_generic", "bool", ["pointer"]);
    },
    get methodIsInflated() {
      return r("il2cpp_method_is_inflated", "bool", ["pointer"]);
    },
    get methodIsInstance() {
      return r("il2cpp_method_is_instance", "bool", ["pointer"]);
    },
    get monitorEnter() {
      return r("il2cpp_monitor_enter", "void", ["pointer"]);
    },
    get monitorExit() {
      return r("il2cpp_monitor_exit", "void", ["pointer"]);
    },
    get monitorPulse() {
      return r("il2cpp_monitor_pulse", "void", ["pointer"]);
    },
    get monitorPulseAll() {
      return r("il2cpp_monitor_pulse_all", "void", ["pointer"]);
    },
    get monitorTryEnter() {
      return r("il2cpp_monitor_try_enter", "bool", ["pointer", "uint32"]);
    },
    get monitorTryWait() {
      return r("il2cpp_monitor_try_wait", "bool", ["pointer", "uint32"]);
    },
    get monitorWait() {
      return r("il2cpp_monitor_wait", "void", ["pointer"]);
    },
    get objectGetClass() {
      return r("il2cpp_object_get_class", "pointer", ["pointer"]);
    },
    get objectGetVirtualMethod() {
      return r("il2cpp_object_get_virtual_method", "pointer", ["pointer", "pointer"]);
    },
    get objectInitialize() {
      return r("il2cpp_runtime_object_init_exception", "void", ["pointer", "pointer"]);
    },
    get objectNew() {
      return r("il2cpp_object_new", "pointer", ["pointer"]);
    },
    get objectGetSize() {
      return r("il2cpp_object_get_size", "uint32", ["pointer"]);
    },
    get objectUnbox() {
      return r("il2cpp_object_unbox", "pointer", ["pointer"]);
    },
    get resolveInternalCall() {
      return r("il2cpp_resolve_icall", "pointer", ["pointer"]);
    },
    get stringGetChars() {
      return r("il2cpp_string_chars", "pointer", ["pointer"]);
    },
    get stringGetLength() {
      return r("il2cpp_string_length", "int32", ["pointer"]);
    },
    get stringNew() {
      return r("il2cpp_string_new", "pointer", ["pointer"]);
    },
    get valueTypeBox() {
      return r("il2cpp_value_box", "pointer", ["pointer", "pointer"]);
    },
    get threadAttach() {
      return r("il2cpp_thread_attach", "pointer", ["pointer"]);
    },
    get threadDetach() {
      return r("il2cpp_thread_detach", "void", ["pointer"]);
    },
    get threadGetAttachedThreads() {
      return r("il2cpp_thread_get_all_attached_threads", "pointer", ["pointer"]);
    },
    get threadGetCurrent() {
      return r("il2cpp_thread_current", "pointer", []);
    },
    get threadIsVm() {
      return r("il2cpp_is_vm_thread", "bool", ["pointer"]);
    },
    get typeEquals() {
      return r("il2cpp_type_equals", "bool", ["pointer", "pointer"]);
    },
    get typeGetClass() {
      return r("il2cpp_class_from_type", "pointer", ["pointer"]);
    },
    get typeGetName() {
      return r("il2cpp_type_get_name", "pointer", ["pointer"]);
    },
    get typeGetObject() {
      return r("il2cpp_type_get_object", "pointer", ["pointer"]);
    },
    get typeGetTypeEnum() {
      return r("il2cpp_type_get_type", "int", ["pointer"]);
    }
  };
  decorate(Il2Cpp3.exports, lazy);
  getter(Il2Cpp3, "memorySnapshotExports", () => new CModule("#include <stdint.h>\n#include <string.h>\n\ntypedef struct Il2CppManagedMemorySnapshot Il2CppManagedMemorySnapshot;\ntypedef struct Il2CppMetadataType Il2CppMetadataType;\n\nstruct Il2CppManagedMemorySnapshot\n{\n  struct Il2CppManagedHeap\n  {\n    uint32_t section_count;\n    void * sections;\n  } heap;\n  struct Il2CppStacks\n  {\n    uint32_t stack_count;\n    void * stacks;\n  } stacks;\n  struct Il2CppMetadataSnapshot\n  {\n    uint32_t type_count;\n    Il2CppMetadataType * types;\n  } metadata_snapshot;\n  struct Il2CppGCHandles\n  {\n    uint32_t tracked_object_count;\n    void ** pointers_to_objects;\n  } gc_handles;\n  struct Il2CppRuntimeInformation\n  {\n    uint32_t pointer_size;\n    uint32_t object_header_size;\n    uint32_t array_header_size;\n    uint32_t array_bounds_offset_in_header;\n    uint32_t array_size_offset_in_header;\n    uint32_t allocation_granularity;\n  } runtime_information;\n  void * additional_user_information;\n};\n\nstruct Il2CppMetadataType\n{\n  uint32_t flags;\n  void * fields;\n  uint32_t field_count;\n  uint32_t statics_size;\n  uint8_t * statics;\n  uint32_t base_or_element_type_index;\n  char * name;\n  const char * assembly_name;\n  uint64_t type_info_address;\n  uint32_t size;\n};\n\nuintptr_t\nil2cpp_memory_snapshot_get_classes (\n    const Il2CppManagedMemorySnapshot * snapshot, Il2CppMetadataType ** iter)\n{\n  const int zero = 0;\n  const void * null = 0;\n\n  if (iter != NULL && snapshot->metadata_snapshot.type_count > zero)\n  {\n    if (*iter == null)\n    {\n      *iter = snapshot->metadata_snapshot.types;\n      return (uintptr_t) (*iter)->type_info_address;\n    }\n    else\n    {\n      Il2CppMetadataType * metadata_type = *iter + 1;\n\n      if (metadata_type < snapshot->metadata_snapshot.types +\n                              snapshot->metadata_snapshot.type_count)\n      {\n        *iter = metadata_type;\n        return (uintptr_t) (*iter)->type_info_address;\n      }\n    }\n  }\n  return 0;\n}\n\nvoid **\nil2cpp_memory_snapshot_get_objects (\n    const Il2CppManagedMemorySnapshot * snapshot, uint32_t * size)\n{\n  *size = snapshot->gc_handles.tracked_object_count;\n  return snapshot->gc_handles.pointers_to_objects;\n}\n"), lazy);
  function r(exportName, retType, argTypes) {
    const handle = Il2Cpp3.$config.exports?.[exportName]?.() ?? Il2Cpp3.module.findExportByName(exportName) ?? Il2Cpp3.memorySnapshotExports[exportName];
    const target = new NativeFunction(handle ?? NULL, retType, argTypes);
    return target.isNull() ? new Proxy(target, {
      get(value, name) {
        const property = value[name];
        return typeof property === "function" ? property.bind(value) : property;
      },
      apply() {
        if (handle == null) {
          raise(`couldn't resolve export ${exportName}`);
        } else if (handle.isNull()) {
          raise(`export ${exportName} points to NULL IL2CPP library has likely been stripped, obfuscated, or customized`);
        }
      }
    }) : target;
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function is(klass) {
    return (element) => {
      if (element instanceof Il2Cpp3.Class) {
        return klass.isAssignableFrom(element);
      } else {
        return klass.isAssignableFrom(element.class);
      }
    };
  }
  Il2Cpp3.is = is;
  function isExactly(klass) {
    return (element) => {
      if (element instanceof Il2Cpp3.Class) {
        return element.equals(klass);
      } else {
        return element.class.equals(klass);
      }
    };
  }
  Il2Cpp3.isExactly = isExactly;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.gc = {
    /**
     * Gets the allocated heap sections managed by IL2CPP.
     */
    get heapSections() {
      const ranges = [];
      Il2Cpp3.exports.gcForEachHeap(new NativeCallback((data, _) => {
        ranges.push({
          base: data.readPointer(),
          size: data.add(Process.pointerSize).readU32()
        });
      }, "void", ["pointer", "pointer"]), NULL);
      return ranges;
    },
    /**
     * Gets the heap size in bytes.
     */
    get heapSize() {
      return Il2Cpp3.exports.gcGetHeapSize();
    },
    /**
     * Determines whether the garbage collector is enabled.
     */
    get isEnabled() {
      return !Il2Cpp3.exports.gcIsDisabled();
    },
    /**
     * Determines whether the garbage collector is incremental
     * ([source](https://docs.unity3d.com/Manual/performance-incremental-garbage-collection.html)).
     */
    get isIncremental() {
      return !!Il2Cpp3.exports.gcIsIncremental();
    },
    /**
     * Gets the number of nanoseconds the garbage collector can spend in a
     * collection step.
     */
    get maxTimeSlice() {
      return Il2Cpp3.exports.gcGetMaxTimeSlice();
    },
    /**
     * Gets the used heap size in bytes.
     */
    get usedHeapSize() {
      return Il2Cpp3.exports.gcGetUsedSize();
    },
    /**
     * Enables or disables the garbage collector.
     */
    set isEnabled(value) {
      value ? Il2Cpp3.exports.gcEnable() : Il2Cpp3.exports.gcDisable();
    },
    /**
     *  Sets the number of nanoseconds the garbage collector can spend in
     * a collection step.
     */
    set maxTimeSlice(nanoseconds) {
      Il2Cpp3.exports.gcSetMaxTimeSlice(nanoseconds);
    },
    /**
     * Returns the heap allocated objects of the specified class. \
     * This variant reads GC descriptors.
     */
    choose(klass) {
      const matches = [];
      const callback = (objects, size) => {
        for (let i = 0; i < size; i++) {
          matches.push(new Il2Cpp3.Object(objects.add(i * Process.pointerSize).readPointer()));
        }
      };
      const chooseCallback = new NativeCallback(callback, "void", ["pointer", "int", "pointer"]);
      if (!Il2Cpp3.exports.livenessCalculationBegin.isNull()) {
        const onWorld = new NativeCallback(() => {
        }, "void", []);
        const state = Il2Cpp3.exports.livenessCalculationBegin(klass, 0, chooseCallback, NULL, onWorld, onWorld);
        Il2Cpp3.exports.livenessCalculationFromStatics(state);
        Il2Cpp3.exports.livenessCalculationEnd(state);
      } else {
        const realloc = (handle, size) => {
          if (!handle.isNull() && size.compare(0) == 0) {
            Il2Cpp3.free(handle);
            return NULL;
          } else {
            return Il2Cpp3.alloc(size);
          }
        };
        const reallocCallback = new NativeCallback(realloc, "pointer", ["pointer", "size_t", "pointer"]);
        this.stopWorld();
        const state = Il2Cpp3.exports.livenessAllocateStruct(klass, 0, chooseCallback, NULL, reallocCallback);
        Il2Cpp3.exports.livenessCalculationFromStatics(state);
        Il2Cpp3.exports.livenessFinalize(state);
        this.startWorld();
        Il2Cpp3.exports.livenessFreeStruct(state);
      }
      return matches;
    },
    /**
     * Forces a garbage collection of the specified generation.
     */
    collect(generation) {
      Il2Cpp3.exports.gcCollect(generation < 0 ? 0 : generation > 2 ? 2 : generation);
    },
    /**
     * Forces a garbage collection.
     */
    collectALittle() {
      Il2Cpp3.exports.gcCollectALittle();
    },
    /**
     *  Resumes all the previously stopped threads.
     */
    startWorld() {
      return Il2Cpp3.exports.gcStartWorld();
    },
    /**
     * Performs an incremental garbage collection.
     */
    startIncrementalCollection() {
      return Il2Cpp3.exports.gcStartIncrementalCollection();
    },
    /**
     * Stops all threads which may access the garbage collected heap, other
     * than the caller.
     */
    stopWorld() {
      return Il2Cpp3.exports.gcStopWorld();
    }
  };
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Android;
(function(Android2) {
  getter(Android2, "apiLevel", () => {
    const value = getProperty("ro.build.version.sdk");
    return value ? parseInt(value) : null;
  }, lazy);
  function getProperty(name) {
    const handle = Process.findModuleByName("libc.so")?.findExportByName("__system_property_get");
    if (handle) {
      const __system_property_get = new NativeFunction(handle, "void", ["pointer", "pointer"]);
      const value = Memory.alloc(92).writePointer(NULL);
      __system_property_get(Memory.allocUtf8String(name), value);
      return value.readCString() ?? void 0;
    }
  }
})(Android || (Android = {}));
function raise(message) {
  const error = new Error(message);
  error.name = "Il2CppError";
  error.stack = error.stack?.replace(/^(Il2Cpp)?Error/, "\x1B[0m\x1B[38;5;9mil2cpp\x1B[0m")?.replace(/\n    at (.+) \((.+):(.+)\)/, "\x1B[3m\x1B[2m")?.concat("\x1B[0m");
  throw error;
}
function warn(message) {
  globalThis.console.log(`\x1B[38;5;11mil2cpp\x1B[0m: ${message}`);
}
function inform(message) {
  globalThis.console.log(`\x1B[38;5;12mil2cpp\x1B[0m: ${message}`);
}
function decorate(target, decorator, descriptors = Object.getOwnPropertyDescriptors(target)) {
  for (const key in descriptors) {
    descriptors[key] = decorator(target, key, descriptors[key]);
  }
  Object.defineProperties(target, descriptors);
  return target;
}
function getter(target, key, get, decorator) {
  globalThis.Object.defineProperty(target, key, decorator?.(target, key, { get, configurable: true }) ?? { get, configurable: true });
}
function lazy(_, propertyKey, descriptor) {
  const getter2 = descriptor.get;
  if (!getter2) {
    throw new Error("@lazy can only be applied to getter accessors");
  }
  descriptor.get = function() {
    const value = getter2.call(this);
    Object.defineProperty(this, propertyKey, {
      value,
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: false
    });
    return value;
  };
  return descriptor;
}
var NativeStruct = class {
  handle;
  constructor(handleOrWrapper) {
    if (handleOrWrapper instanceof NativePointer) {
      this.handle = handleOrWrapper;
    } else {
      this.handle = handleOrWrapper.handle;
    }
  }
  equals(other) {
    return this.handle.equals(other.handle);
  }
  isNull() {
    return this.handle.isNull();
  }
  asNullable() {
    return this.isNull() ? null : this;
  }
};
function addFlippedEntries(obj) {
  return Object.keys(obj).reduce((obj2, key) => (obj2[obj2[key]] = key, obj2), obj);
}
NativePointer.prototype.offsetOf = function(condition, depth) {
  depth ??= 512;
  for (let i = 0; depth > 0 ? i < depth : i < -depth; i++) {
    if (condition(depth > 0 ? this.add(i) : this.sub(i))) {
      return i;
    }
  }
  return null;
};
function readNativeIterator(block) {
  const array = [];
  const iterator = Memory.alloc(Process.pointerSize);
  let handle = block(iterator);
  while (!handle.isNull()) {
    array.push(handle);
    handle = block(iterator);
  }
  return array;
}
function readNativeList(block) {
  const lengthPointer = Memory.alloc(Process.pointerSize);
  const startPointer = block(lengthPointer);
  if (startPointer.isNull()) {
    return [];
  }
  const array = new Array(lengthPointer.readInt());
  for (let i = 0; i < array.length; i++) {
    array[i] = startPointer.add(i * Process.pointerSize).readPointer();
  }
  return array;
}
function recycle(Class) {
  return new Proxy(Class, {
    cache: /* @__PURE__ */ new Map(),
    construct(Target, argArray) {
      const handle = argArray[0].toUInt32();
      if (!this.cache.has(handle)) {
        this.cache.set(handle, new Target(argArray[0]));
      }
      return this.cache.get(handle);
    }
  });
}
var UnityVersion;
(function(UnityVersion2) {
  const pattern = /(6\d{3}|20\d{2}|\d)\.(\d)\.(\d{1,2})(?:[abcfp]|rc){0,2}\d?/;
  function find(string) {
    return string?.match(pattern)?.[0];
  }
  UnityVersion2.find = find;
  function gte(a, b) {
    return compare(a, b) >= 0;
  }
  UnityVersion2.gte = gte;
  function lt(a, b) {
    return compare(a, b) < 0;
  }
  UnityVersion2.lt = lt;
  function compare(a, b) {
    const aMatches = a.match(pattern);
    const bMatches = b.match(pattern);
    for (let i = 1; i <= 3; i++) {
      const a2 = Number(aMatches?.[i] ?? -1);
      const b2 = Number(bMatches?.[i] ?? -1);
      if (a2 > b2)
        return 1;
      else if (a2 < b2)
        return -1;
    }
    return 0;
  }
})(UnityVersion || (UnityVersion = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function alloc(size = Process.pointerSize) {
    return Il2Cpp3.exports.alloc(size);
  }
  Il2Cpp3.alloc = alloc;
  function free(pointer) {
    return Il2Cpp3.exports.free(pointer);
  }
  Il2Cpp3.free = free;
  function read(pointer, type) {
    switch (type.enumValue) {
      case Il2Cpp3.Type.Enum.BOOLEAN:
        return !!pointer.readS8();
      case Il2Cpp3.Type.Enum.BYTE:
        return pointer.readS8();
      case Il2Cpp3.Type.Enum.UBYTE:
        return pointer.readU8();
      case Il2Cpp3.Type.Enum.SHORT:
        return pointer.readS16();
      case Il2Cpp3.Type.Enum.USHORT:
        return pointer.readU16();
      case Il2Cpp3.Type.Enum.INT:
        return pointer.readS32();
      case Il2Cpp3.Type.Enum.UINT:
        return pointer.readU32();
      case Il2Cpp3.Type.Enum.CHAR:
        return pointer.readU16();
      case Il2Cpp3.Type.Enum.LONG:
        return pointer.readS64();
      case Il2Cpp3.Type.Enum.ULONG:
        return pointer.readU64();
      case Il2Cpp3.Type.Enum.FLOAT:
        return pointer.readFloat();
      case Il2Cpp3.Type.Enum.DOUBLE:
        return pointer.readDouble();
      case Il2Cpp3.Type.Enum.NINT:
      case Il2Cpp3.Type.Enum.NUINT:
        return pointer.readPointer();
      case Il2Cpp3.Type.Enum.POINTER:
        return new Il2Cpp3.Pointer(pointer.readPointer(), type.class.baseType);
      case Il2Cpp3.Type.Enum.VALUE_TYPE:
        return new Il2Cpp3.ValueType(pointer, type);
      case Il2Cpp3.Type.Enum.OBJECT:
      case Il2Cpp3.Type.Enum.CLASS:
        return new Il2Cpp3.Object(pointer.readPointer());
      case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        return type.class.isValueType ? new Il2Cpp3.ValueType(pointer, type) : new Il2Cpp3.Object(pointer.readPointer());
      case Il2Cpp3.Type.Enum.STRING:
        return new Il2Cpp3.String(pointer.readPointer());
      case Il2Cpp3.Type.Enum.ARRAY:
      case Il2Cpp3.Type.Enum.NARRAY:
        return new Il2Cpp3.Array(pointer.readPointer());
    }
    raise(`couldn't read the value from ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
  }
  Il2Cpp3.read = read;
  function write(pointer, value, type) {
    switch (type.enumValue) {
      case Il2Cpp3.Type.Enum.BOOLEAN:
        return pointer.writeS8(+value);
      case Il2Cpp3.Type.Enum.BYTE:
        return pointer.writeS8(value);
      case Il2Cpp3.Type.Enum.UBYTE:
        return pointer.writeU8(value);
      case Il2Cpp3.Type.Enum.SHORT:
        return pointer.writeS16(value);
      case Il2Cpp3.Type.Enum.USHORT:
        return pointer.writeU16(value);
      case Il2Cpp3.Type.Enum.INT:
        return pointer.writeS32(value);
      case Il2Cpp3.Type.Enum.UINT:
        return pointer.writeU32(value);
      case Il2Cpp3.Type.Enum.CHAR:
        return pointer.writeU16(value);
      case Il2Cpp3.Type.Enum.LONG:
        return pointer.writeS64(value);
      case Il2Cpp3.Type.Enum.ULONG:
        return pointer.writeU64(value);
      case Il2Cpp3.Type.Enum.FLOAT:
        return pointer.writeFloat(value);
      case Il2Cpp3.Type.Enum.DOUBLE:
        return pointer.writeDouble(value);
      case Il2Cpp3.Type.Enum.NINT:
      case Il2Cpp3.Type.Enum.NUINT:
      case Il2Cpp3.Type.Enum.POINTER:
      case Il2Cpp3.Type.Enum.STRING:
      case Il2Cpp3.Type.Enum.ARRAY:
      case Il2Cpp3.Type.Enum.NARRAY:
        return pointer.writePointer(value);
      case Il2Cpp3.Type.Enum.VALUE_TYPE:
        return Memory.copy(pointer, value, type.class.valueTypeSize), pointer;
      case Il2Cpp3.Type.Enum.OBJECT:
      case Il2Cpp3.Type.Enum.CLASS:
      case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        return value instanceof Il2Cpp3.ValueType ? (Memory.copy(pointer, value, type.class.valueTypeSize), pointer) : pointer.writePointer(value);
    }
    raise(`couldn't write value ${value} to ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
  }
  Il2Cpp3.write = write;
  function fromFridaValue(value, type) {
    if (globalThis.Array.isArray(value)) {
      const handle = Memory.alloc(type.class.valueTypeSize);
      const fields = type.class.fields.filter((_) => !_.isStatic);
      for (let i = 0; i < fields.length; i++) {
        const convertedValue = fromFridaValue(value[i], fields[i].type);
        write(handle.add(fields[i].offset).sub(Il2Cpp3.Object.headerSize), convertedValue, fields[i].type);
      }
      return new Il2Cpp3.ValueType(handle, type);
    } else if (value instanceof NativePointer) {
      if (type.isByReference) {
        return new Il2Cpp3.Reference(value, type);
      }
      switch (type.enumValue) {
        case Il2Cpp3.Type.Enum.POINTER:
          return new Il2Cpp3.Pointer(value, type.class.baseType);
        case Il2Cpp3.Type.Enum.STRING:
          return new Il2Cpp3.String(value);
        case Il2Cpp3.Type.Enum.CLASS:
        case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        case Il2Cpp3.Type.Enum.OBJECT:
          return new Il2Cpp3.Object(value);
        case Il2Cpp3.Type.Enum.ARRAY:
        case Il2Cpp3.Type.Enum.NARRAY:
          return new Il2Cpp3.Array(value);
        default:
          return value;
      }
    } else if (type.enumValue == Il2Cpp3.Type.Enum.BOOLEAN) {
      return !!value;
    } else if (type.enumValue == Il2Cpp3.Type.Enum.VALUE_TYPE && type.class.isEnum) {
      return fromFridaValue([value], type);
    } else {
      return value;
    }
  }
  Il2Cpp3.fromFridaValue = fromFridaValue;
  function toFridaValue(value) {
    if (typeof value == "boolean") {
      return +value;
    } else if (value instanceof Il2Cpp3.ValueType) {
      if (value.type.class.isEnum) {
        return value.field("value__").value;
      } else {
        const _ = value.type.class.fields.filter((_2) => !_2.isStatic).map((_2) => toFridaValue(_2.bind(value).value));
        return _.length == 0 ? [0] : _;
      }
    } else {
      return value;
    }
  }
  Il2Cpp3.toFridaValue = toFridaValue;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  getter(Il2Cpp3, "module", () => {
    return tryModule() ?? raise("Could not find IL2CPP module");
  });
  async function initialize(blocking = false) {
    const module = tryModule() ?? await new Promise((resolve) => {
      const [moduleName, fallbackModuleName] = getExpectedModuleNames();
      const timeout = setTimeout(() => {
        warn(`after 10 seconds, IL2CPP module '${moduleName}' has not been loaded yet, is the app running?`);
      }, 1e4);
      const moduleObserver = Process.attachModuleObserver({
        onAdded(module2) {
          if (module2.name == moduleName || fallbackModuleName && module2.name == fallbackModuleName) {
            clearTimeout(timeout);
            setImmediate(() => {
              resolve(module2);
              moduleObserver.detach();
            });
          }
        }
      });
    });
    Reflect.defineProperty(Il2Cpp3, "module", { value: module });
    if (Il2Cpp3.exports.getCorlib().isNull()) {
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!Il2Cpp3.exports.getCorlib().isNull()) {
            warn(`resuming execution despite IL2CPP initialization not being captured in time, please open an issue as this is suboptimal`);
            interceptor.detach();
            resolve(false);
          }
        }, 1e3);
        const interceptor = Interceptor.attach(Il2Cpp3.exports.initialize, {
          onEnter() {
            clearTimeout(timeout);
          },
          onLeave() {
            interceptor.detach();
            blocking ? resolve(true) : setImmediate(() => resolve(false));
          }
        });
      });
    }
    return false;
  }
  Il2Cpp3.initialize = initialize;
  function tryModule() {
    const [moduleName, fallback] = getExpectedModuleNames();
    return Process.findModuleByName(moduleName) ?? Process.findModuleByName(fallback ?? moduleName) ?? (Process.platform == "darwin" ? Process.findModuleByAddress(DebugSymbol.fromName("il2cpp_init").address) : void 0) ?? void 0;
  }
  function getExpectedModuleNames() {
    if (Il2Cpp3.$config.moduleName) {
      return [Il2Cpp3.$config.moduleName];
    }
    switch (Process.platform) {
      case "linux":
        return [Android.apiLevel ? "libil2cpp.so" : "GameAssembly.so"];
      case "windows":
        return ["GameAssembly.dll"];
      case "darwin":
        return ["UnityFramework", "GameAssembly.dylib"];
    }
    raise(`${Process.platform} is not supported yet`);
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function nullable(valueOrNull, klass) {
    const actualClass = typeof valueOrNull == "boolean" ? Il2Cpp3.corlib.class("System.Boolean") : typeof valueOrNull == "number" ? klass ?? Il2Cpp3.corlib.class("System.Int32") : valueOrNull instanceof Int64 ? Il2Cpp3.corlib.class("System.Int64") : valueOrNull instanceof UInt64 ? Il2Cpp3.corlib.class("System.UInt64") : valueOrNull instanceof NativePointer ? klass ?? Il2Cpp3.corlib.class("System.IntPtr") : valueOrNull instanceof Il2Cpp3.ValueType ? valueOrNull.type.class : klass ?? raise(`A class must be specified when constructing a nullable for value '${valueOrNull}'`);
    if (actualClass.isValueType == false) {
      raise(`Cannot create nullable value type out of a reference type '${actualClass.type.name}'`);
    }
    const inflatedClass = Il2Cpp3.corlib.class("System.Nullable`1").inflate(actualClass);
    const struct = new Il2Cpp3.ValueType(Memory.alloc(inflatedClass.valueTypeSize), inflatedClass.type);
    (struct.tryField("hasValue") ?? struct.field("has_value")).value = valueOrNull != null;
    if (valueOrNull != null) {
      struct.field("value").value = valueOrNull;
    }
    return struct;
  }
  Il2Cpp3.nullable = nullable;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  async function perform(block, flag = "bind") {
    let attachedThread = null;
    try {
      const isInMainThread = await Il2Cpp3.initialize(flag == "main");
      if (flag == "main" && !isInMainThread) {
        return perform(() => Il2Cpp3.mainThread.schedule(block), "free");
      }
      if (Il2Cpp3.currentThread == null) {
        attachedThread = Il2Cpp3.domain.attach();
      }
      if (flag == "bind" && attachedThread != null) {
        Script.bindWeak(globalThis, () => attachedThread?.detach());
      }
      const result = block();
      return result instanceof Promise ? await result : result;
    } catch (error) {
      Script.nextTick((_) => {
        throw _;
      }, error);
      return Promise.reject(error);
    } finally {
      if (flag == "free" && attachedThread != null) {
        attachedThread.detach();
      }
    }
  }
  Il2Cpp3.perform = perform;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Tracer {
    /** @internal */
    #state = {
      depth: 0,
      buffer: [],
      history: /* @__PURE__ */ new Set(),
      flush: () => {
        if (this.#state.depth == 0) {
          const message = `
${this.#state.buffer.join("\n")}
`;
          if (this.#verbose) {
            inform(message);
          } else {
            const hash = Checksum.compute("md5", message);
            if (!this.#state.history.has(hash)) {
              this.#state.history.add(hash);
              inform(message);
            }
          }
          this.#state.buffer.length = 0;
        }
      }
    };
    /** @internal */
    #threadId = Il2Cpp3.mainThread.id;
    /** @internal */
    #verbose = false;
    /** @internal */
    #applier;
    /** @internal */
    #targets = [];
    /** @internal */
    #domain;
    /** @internal */
    #assemblies;
    /** @internal */
    #classes;
    /** @internal */
    #methods;
    /** @internal */
    #assemblyFilter;
    /** @internal */
    #classFilter;
    /** @internal */
    #methodFilter;
    /** @internal */
    #parameterFilter;
    constructor(applier) {
      this.#applier = applier;
    }
    /** */
    thread(thread) {
      this.#threadId = thread.id;
      return this;
    }
    /** Determines whether print duplicate logs. */
    verbose(value) {
      this.#verbose = value;
      return this;
    }
    /** Sets the application domain as the place where to find the target methods. */
    domain() {
      this.#domain = Il2Cpp3.domain;
      return this;
    }
    /** Sets the passed `assemblies` as the place where to find the target methods. */
    assemblies(...assemblies) {
      this.#assemblies = assemblies;
      return this;
    }
    /** Sets the passed `classes` as the place where to find the target methods. */
    classes(...classes) {
      this.#classes = classes;
      return this;
    }
    /** Sets the passed `methods` as the target methods. */
    methods(...methods) {
      this.#methods = methods;
      return this;
    }
    /** Filters the assemblies where to find the target methods. */
    filterAssemblies(filter) {
      this.#assemblyFilter = filter;
      return this;
    }
    /** Filters the classes where to find the target methods. */
    filterClasses(filter) {
      this.#classFilter = filter;
      return this;
    }
    /** Filters the target methods. */
    filterMethods(filter) {
      this.#methodFilter = filter;
      return this;
    }
    /** Filters the target methods. */
    filterParameters(filter) {
      this.#parameterFilter = filter;
      return this;
    }
    /** Commits the current changes by finding the target methods. */
    and() {
      const filterMethod = (method) => {
        if (this.#parameterFilter == void 0) {
          this.#targets.push(method);
          return;
        }
        for (const parameter of method.parameters) {
          if (this.#parameterFilter(parameter)) {
            this.#targets.push(method);
            break;
          }
        }
      };
      const filterMethods = (values) => {
        for (const method of values) {
          filterMethod(method);
        }
      };
      const filterClass = (klass) => {
        if (this.#methodFilter == void 0) {
          filterMethods(klass.methods);
          return;
        }
        for (const method of klass.methods) {
          if (this.#methodFilter(method)) {
            filterMethod(method);
          }
        }
      };
      const filterClasses = (values) => {
        for (const klass of values) {
          filterClass(klass);
        }
      };
      const filterAssembly = (assembly) => {
        if (this.#classFilter == void 0) {
          filterClasses(assembly.image.classes);
          return;
        }
        for (const klass of assembly.image.classes) {
          if (this.#classFilter(klass)) {
            filterClass(klass);
          }
        }
      };
      const filterAssemblies = (assemblies) => {
        for (const assembly of assemblies) {
          filterAssembly(assembly);
        }
      };
      const filterDomain = (domain) => {
        if (this.#assemblyFilter == void 0) {
          filterAssemblies(domain.assemblies);
          return;
        }
        for (const assembly of domain.assemblies) {
          if (this.#assemblyFilter(assembly)) {
            filterAssembly(assembly);
          }
        }
      };
      this.#methods ? filterMethods(this.#methods) : this.#classes ? filterClasses(this.#classes) : this.#assemblies ? filterAssemblies(this.#assemblies) : this.#domain ? filterDomain(this.#domain) : void 0;
      this.#assemblies = void 0;
      this.#classes = void 0;
      this.#methods = void 0;
      this.#assemblyFilter = void 0;
      this.#classFilter = void 0;
      this.#methodFilter = void 0;
      this.#parameterFilter = void 0;
      return this;
    }
    /** Starts tracing. */
    attach() {
      for (const target of this.#targets) {
        if (!target.virtualAddress.isNull()) {
          try {
            this.#applier(target, this.#state, this.#threadId);
          } catch (e) {
            switch (e.message) {
              case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
              case "already replaced this function":
                break;
              default:
                throw e;
            }
          }
        }
      }
    }
  }
  Il2Cpp3.Tracer = Tracer;
  function trace(parameters = false) {
    const applier = () => (method, state, threadId) => {
      const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
      Interceptor.attach(method.virtualAddress, {
        onEnter() {
          if (this.threadId == threadId) {
            state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
          }
        },
        onLeave() {
          if (this.threadId == threadId) {
            state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
            state.flush();
          }
        }
      });
    };
    const applierWithParameters = () => (method, state, threadId) => {
      const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
      const parameterStartIndex = +method.nativeSignatureHasInstanceSlot;
      const callback = function(...args) {
        if (this.threadId == threadId) {
          const thisParameter = method.isStatic ? void 0 : new Il2Cpp3.Parameter("this", -1, method.class.type);
          const parameters2 = thisParameter ? [thisParameter].concat(method.parameters) : method.parameters;
          state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m(${parameters2.map((e) => `\x1B[32m${e.name}\x1B[0m = \x1B[31m${Il2Cpp3.fromFridaValue(args[e.position + parameterStartIndex], e.type)}\x1B[0m`).join(", ")})`);
        }
        const returnValue = method.nativeFunction(...args);
        if (this.threadId == threadId) {
          state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m${returnValue == void 0 ? "" : ` = \x1B[36m${Il2Cpp3.fromFridaValue(returnValue, method.returnType)}`}\x1B[0m`);
          state.flush();
        }
        return returnValue;
      };
      method.revert();
      const nativeCallback = new NativeCallback(callback, method.returnType.fridaAlias, method.fridaSignature);
      Interceptor.replace(method.virtualAddress, nativeCallback);
    };
    return new Il2Cpp3.Tracer(parameters ? applierWithParameters() : applier());
  }
  Il2Cpp3.trace = trace;
  function backtrace(mode) {
    const methods = Il2Cpp3.domain.assemblies.flatMap((_) => _.image.classes.flatMap((_2) => _2.methods.filter((_3) => !_3.virtualAddress.isNull()))).sort((_, __) => _.virtualAddress.compare(__.virtualAddress));
    const searchInsert = (target) => {
      let left = 0;
      let right = methods.length - 1;
      while (left <= right) {
        const pivot = Math.floor((left + right) / 2);
        const comparison = methods[pivot].virtualAddress.compare(target);
        if (comparison == 0) {
          return methods[pivot];
        } else if (comparison > 0) {
          right = pivot - 1;
        } else {
          left = pivot + 1;
        }
      }
      return methods[right];
    };
    const applier = () => (method, state, threadId) => {
      Interceptor.attach(method.virtualAddress, function() {
        if (this.threadId == threadId) {
          const handles = globalThis.Thread.backtrace(this.context, mode);
          handles.unshift(method.virtualAddress);
          for (const handle of handles) {
            if (handle.compare(Il2Cpp3.module.base) > 0 && handle.compare(Il2Cpp3.module.base.add(Il2Cpp3.module.size)) < 0) {
              const method2 = searchInsert(handle);
              if (method2) {
                const offset = handle.sub(method2.virtualAddress);
                if (offset.compare(4095) < 0) {
                  state.buffer.push(`\x1B[2m0x${method2.relativeVirtualAddress.toString(16).padStart(8, "0")}\x1B[0m\x1B[2m+0x${offset.toString(16).padStart(3, `0`)}\x1B[0m ${method2.class.type.name}::\x1B[1m${method2.name}\x1B[0m`);
                }
              }
            }
          }
          state.flush();
        }
      });
    };
    return new Il2Cpp3.Tracer(applier());
  }
  Il2Cpp3.backtrace = backtrace;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Array2 extends NativeStruct {
    /** Gets the Il2CppArray struct size, possibly equal to `Process.pointerSize * 4`. */
    static get headerSize() {
      return Il2Cpp3.corlib.class("System.Array").instanceSize;
    }
    /** @internal Gets a pointer to the first element of the current array. */
    get elements() {
      const array2 = Il2Cpp3.string("vfsfitvnm").object.method("ToCharArray", 0).invoke();
      const offset = Memory.scanSync(array2.handle, 255, "76 00 66 00 73 00 66 00 69 00 74 00 76 00 6e 00 6d 00")[0]?.address?.sub(array2.handle) ?? raise("couldn't find the elements offset in the native array struct");
      getter(Il2Cpp3.Array.prototype, "elements", function() {
        return new Il2Cpp3.Pointer(this.handle.add(offset), this.elementType);
      }, lazy);
      return this.elements;
    }
    /** Gets the size of the object encompassed by the current array. */
    get elementSize() {
      return this.elementType.class.arrayElementSize;
    }
    /** Gets the type of the object encompassed by the current array. */
    get elementType() {
      return this.object.class.type.class.baseType;
    }
    /** Gets the total number of elements in all the dimensions of the current array. */
    get length() {
      return Il2Cpp3.exports.arrayGetLength(this);
    }
    /** Gets the encompassing object of the current array. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** Gets the element at the specified index of the current array. */
    get(index) {
      if (index < 0 || index >= this.length) {
        raise(`cannot get element at index ${index} as the array length is ${this.length}`);
      }
      return this.elements.get(index);
    }
    /** Sets the element at the specified index of the current array. */
    set(index, value) {
      if (index < 0 || index >= this.length) {
        raise(`cannot set element at index ${index} as the array length is ${this.length}`);
      }
      this.elements.set(index, value);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `[${this.elements.read(this.length, 0)}]`;
    }
    /** Iterable. */
    *[Symbol.iterator]() {
      for (let i = 0; i < this.length; i++) {
        yield this.elements.get(i);
      }
    }
  }
  __decorate([
    lazy
  ], Array2.prototype, "elementSize", null);
  __decorate([
    lazy
  ], Array2.prototype, "elementType", null);
  __decorate([
    lazy
  ], Array2.prototype, "length", null);
  __decorate([
    lazy
  ], Array2.prototype, "object", null);
  __decorate([
    lazy
  ], Array2, "headerSize", null);
  Il2Cpp3.Array = Array2;
  function array(klass, lengthOrElements) {
    const length = typeof lengthOrElements == "number" ? lengthOrElements : lengthOrElements.length;
    const array2 = new Il2Cpp3.Array(Il2Cpp3.exports.arrayNew(klass, length));
    if (globalThis.Array.isArray(lengthOrElements)) {
      array2.elements.write(lengthOrElements);
    }
    return array2;
  }
  Il2Cpp3.array = array;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Assembly = class Assembly extends NativeStruct {
    /** Gets the image of this assembly. */
    get image() {
      if (Il2Cpp3.exports.assemblyGetImage.isNull()) {
        const runtimeModule = this.object.tryMethod("GetType", 1)?.invoke(Il2Cpp3.string("<Module>"))?.asNullable()?.tryMethod("get_Module")?.invoke() ?? this.object.tryMethod("GetModules", 1)?.invoke(false)?.get(0) ?? raise(`couldn't find the runtime module object of assembly ${this.name}`);
        return new Il2Cpp3.Image(runtimeModule.field("_impl").value);
      }
      return new Il2Cpp3.Image(Il2Cpp3.exports.assemblyGetImage(this));
    }
    /** Gets the name of this assembly. */
    get name() {
      return this.image.name.replace(".dll", "");
    }
    /** Gets the encompassing object of the current assembly. */
    get object() {
      for (const _ of Il2Cpp3.domain.object.method("GetAssemblies", 1).invoke(false)) {
        if (_.field("_mono_assembly").value.equals(this)) {
          return _;
        }
      }
      raise("couldn't find the object of the native assembly struct");
    }
  };
  __decorate([
    lazy
  ], Assembly.prototype, "name", null);
  __decorate([
    lazy
  ], Assembly.prototype, "object", null);
  Assembly = __decorate([
    recycle
  ], Assembly);
  Il2Cpp3.Assembly = Assembly;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Class = class Class extends NativeStruct {
    /** Gets the actual size of the instance of the current class. */
    get actualInstanceSize() {
      const SystemString = Il2Cpp3.corlib.class("System.String");
      const offset = SystemString.handle.offsetOf((_) => _.readInt() == SystemString.instanceSize - 2) ?? raise("couldn't find the actual instance size offset in the native class struct");
      getter(Il2Cpp3.Class.prototype, "actualInstanceSize", function() {
        return this.handle.add(offset).readS32();
      }, lazy);
      return this.actualInstanceSize;
    }
    /** Gets the array class which encompass the current class. */
    get arrayClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetArrayClass(this, 1));
    }
    /** Gets the size of the object encompassed by the current array class. */
    get arrayElementSize() {
      return Il2Cpp3.exports.classGetArrayElementSize(this);
    }
    /** Gets the name of the assembly in which the current class is defined. */
    get assemblyName() {
      return Il2Cpp3.exports.classGetAssemblyName(this).readUtf8String().replace(".dll", "");
    }
    /** Gets the class that declares the current nested class. */
    get declaringClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetDeclaringType(this)).asNullable();
    }
    /** Gets the encompassed type of this array, reference, pointer or enum type. */
    get baseType() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.classGetBaseType(this)).asNullable();
    }
    /** Gets the class of the object encompassed or referred to by the current array, pointer or reference class. */
    get elementClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetElementClass(this)).asNullable();
    }
    /** Gets the fields of the current class. */
    get fields() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetFields(this, _)).map((_) => new Il2Cpp3.Field(_));
    }
    /** Gets the flags of the current class. */
    get flags() {
      return Il2Cpp3.exports.classGetFlags(this);
    }
    /** Gets the full name (namespace + name) of the current class. */
    get fullName() {
      return this.namespace ? `${this.namespace}.${this.name}` : this.name;
    }
    /** Gets the generic class of the current class if the current class is inflated. */
    get genericClass() {
      const klass = this.image.tryClass(this.fullName)?.asNullable();
      return klass?.equals(this) ? null : klass ?? null;
    }
    /** Gets the generics parameters of this generic class. */
    get generics() {
      if (!this.isGeneric && !this.isInflated) {
        return [];
      }
      const types = this.type.object.method("GetGenericArguments").invoke();
      return globalThis.Array.from(types).map((_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
    }
    /** Determines whether the GC has tracking references to the current class instances. */
    get hasReferences() {
      return !!Il2Cpp3.exports.classHasReferences(this);
    }
    /** Determines whether ther current class has a valid static constructor. */
    get hasStaticConstructor() {
      const staticConstructor = this.tryMethod(".cctor");
      return staticConstructor != null && !staticConstructor.virtualAddress.isNull();
    }
    /** Gets the image in which the current class is defined. */
    get image() {
      return new Il2Cpp3.Image(Il2Cpp3.exports.classGetImage(this));
    }
    /** Gets the size of the instance of the current class. */
    get instanceSize() {
      return Il2Cpp3.exports.classGetInstanceSize(this);
    }
    /** Determines whether the current class is abstract. */
    get isAbstract() {
      return !!Il2Cpp3.exports.classIsAbstract(this);
    }
    /** Determines whether the current class is blittable. */
    get isBlittable() {
      return !!Il2Cpp3.exports.classIsBlittable(this);
    }
    /** Determines whether the current class is an enumeration. */
    get isEnum() {
      return !!Il2Cpp3.exports.classIsEnum(this);
    }
    /** Determines whether the current class is a generic one. */
    get isGeneric() {
      return !!Il2Cpp3.exports.classIsGeneric(this);
    }
    /** Determines whether the current class is inflated. */
    get isInflated() {
      return !!Il2Cpp3.exports.classIsInflated(this);
    }
    /** Determines whether the current class is an interface. */
    get isInterface() {
      return !!Il2Cpp3.exports.classIsInterface(this);
    }
    /** Determines whether the current class is a struct. */
    get isStruct() {
      return this.isValueType && !this.isEnum;
    }
    /** Determines whether the current class is a value type. */
    get isValueType() {
      return !!Il2Cpp3.exports.classIsValueType(this);
    }
    /** Gets the interfaces implemented or inherited by the current class. */
    get interfaces() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetInterfaces(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the methods implemented by the current class. */
    get methods() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetMethods(this, _)).map((_) => new Il2Cpp3.Method(_));
    }
    /** Gets the name of the current class. */
    get name() {
      return Il2Cpp3.exports.classGetName(this).readUtf8String();
    }
    /** Gets the namespace of the current class. */
    get namespace() {
      return Il2Cpp3.exports.classGetNamespace(this).readUtf8String() || void 0;
    }
    /** Gets the classes nested inside the current class. */
    get nestedClasses() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetNestedClasses(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the class from which the current class directly inherits. */
    get parent() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetParent(this)).asNullable();
    }
    /** Gets the pointer class of the current class. */
    get pointerClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(this.type.object.method("MakePointerType").invoke()));
    }
    /** Gets the rank (number of dimensions) of the current array class. */
    get rank() {
      let rank = 0;
      const name = this.name;
      for (let i = this.name.length - 1; i > 0; i--) {
        const c = name[i];
        if (c == "]")
          rank++;
        else if (c == "[" || rank == 0)
          break;
        else if (c == ",")
          rank++;
        else
          break;
      }
      return rank;
    }
    /** Gets a pointer to the static fields of the current class. */
    get staticFieldsData() {
      return Il2Cpp3.exports.classGetStaticFieldData(this);
    }
    /** Gets the size of the instance - as a value type - of the current class. */
    get valueTypeSize() {
      return Il2Cpp3.exports.classGetValueTypeSize(this, NULL);
    }
    /** Gets the type of the current class. */
    get type() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.classGetType(this));
    }
    /** Allocates a new object of the current class. */
    alloc() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.objectNew(this));
    }
    /** Gets the field identified by the given name. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find field ${name} in class ${this.type.name}`);
    }
    /** Gets the hierarchy of the current class. */
    *hierarchy(options) {
      let klass = options?.includeCurrent ?? true ? this : this.parent;
      while (klass) {
        yield klass;
        klass = klass.parent;
      }
    }
    /** Builds a generic instance of the current generic class. */
    inflate(...classes) {
      if (!this.isGeneric) {
        raise(`cannot inflate class ${this.type.name} as it has no generic parameters`);
      }
      if (this.generics.length != classes.length) {
        raise(`cannot inflate class ${this.type.name} as it needs ${this.generics.length} generic parameter(s), not ${classes.length}`);
      }
      const types = classes.map((_) => _.type.object);
      const typeArray = Il2Cpp3.array(Il2Cpp3.corlib.class("System.Type"), types);
      const inflatedType = this.type.object.method("MakeGenericType", 1).invoke(typeArray);
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(inflatedType));
    }
    /** Calls the static constructor of the current class. */
    initialize() {
      Il2Cpp3.exports.classInitialize(this);
      return this;
    }
    /** Determines whether an instance of `other` class can be assigned to a variable of the current type. */
    isAssignableFrom(other) {
      return !!Il2Cpp3.exports.classIsAssignableFrom(this, other);
    }
    /** Determines whether the current class derives from `other` class. */
    isSubclassOf(other, checkInterfaces) {
      return !!Il2Cpp3.exports.classIsSubclassOf(this, other, +checkInterfaces);
    }
    /** Gets the method identified by the given name and parameter count. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find method ${name} in class ${this.type.name}`);
    }
    /** Gets the nested class with the given name. */
    nested(name) {
      return this.tryNested(name) ?? raise(`couldn't find nested class ${name} in class ${this.type.name}`);
    }
    /** Allocates a new object of the current class and calls its default constructor. */
    new() {
      const object = this.alloc();
      const exceptionArray = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.objectInitialize(object, exceptionArray);
      const exception = exceptionArray.readPointer();
      if (!exception.isNull()) {
        raise(new Il2Cpp3.Object(exception).toString());
      }
      return object;
    }
    /** Gets the field with the given name. */
    tryField(name) {
      return new Il2Cpp3.Field(Il2Cpp3.exports.classGetFieldFromName(this, Memory.allocUtf8String(name))).asNullable();
    }
    /** Gets the method with the given name and parameter count. */
    tryMethod(name, parameterCount = -1) {
      return new Il2Cpp3.Method(Il2Cpp3.exports.classGetMethodFromName(this, Memory.allocUtf8String(name), parameterCount)).asNullable();
    }
    /** Gets the nested class with the given name. */
    tryNested(name) {
      return this.nestedClasses.find((_) => _.name == name);
    }
    /** */
    toString() {
      const inherited = [this.parent].concat(this.interfaces);
      return `// ${this.assemblyName}
${this.isEnum ? `enum` : this.isStruct ? `struct` : this.isInterface ? `interface` : `class`} ${this.type.name}${inherited ? ` : ${inherited.map((_) => _?.type.name).join(`, `)}` : ``}
{
    ${this.fields.join(`
    `)}
    ${this.methods.join(`
    `)}
}`;
    }
    /** Executes a callback for every defined class. */
    static enumerate(block) {
      const callback = new NativeCallback((_) => block(new Il2Cpp3.Class(_)), "void", ["pointer", "pointer"]);
      return Il2Cpp3.exports.classForEach(callback, NULL);
    }
  };
  __decorate([
    lazy
  ], Class.prototype, "arrayClass", null);
  __decorate([
    lazy
  ], Class.prototype, "arrayElementSize", null);
  __decorate([
    lazy
  ], Class.prototype, "assemblyName", null);
  __decorate([
    lazy
  ], Class.prototype, "declaringClass", null);
  __decorate([
    lazy
  ], Class.prototype, "baseType", null);
  __decorate([
    lazy
  ], Class.prototype, "elementClass", null);
  __decorate([
    lazy
  ], Class.prototype, "fields", null);
  __decorate([
    lazy
  ], Class.prototype, "flags", null);
  __decorate([
    lazy
  ], Class.prototype, "fullName", null);
  __decorate([
    lazy
  ], Class.prototype, "generics", null);
  __decorate([
    lazy
  ], Class.prototype, "hasReferences", null);
  __decorate([
    lazy
  ], Class.prototype, "hasStaticConstructor", null);
  __decorate([
    lazy
  ], Class.prototype, "image", null);
  __decorate([
    lazy
  ], Class.prototype, "instanceSize", null);
  __decorate([
    lazy
  ], Class.prototype, "isAbstract", null);
  __decorate([
    lazy
  ], Class.prototype, "isBlittable", null);
  __decorate([
    lazy
  ], Class.prototype, "isEnum", null);
  __decorate([
    lazy
  ], Class.prototype, "isGeneric", null);
  __decorate([
    lazy
  ], Class.prototype, "isInflated", null);
  __decorate([
    lazy
  ], Class.prototype, "isInterface", null);
  __decorate([
    lazy
  ], Class.prototype, "isValueType", null);
  __decorate([
    lazy
  ], Class.prototype, "interfaces", null);
  __decorate([
    lazy
  ], Class.prototype, "methods", null);
  __decorate([
    lazy
  ], Class.prototype, "name", null);
  __decorate([
    lazy
  ], Class.prototype, "namespace", null);
  __decorate([
    lazy
  ], Class.prototype, "nestedClasses", null);
  __decorate([
    lazy
  ], Class.prototype, "parent", null);
  __decorate([
    lazy
  ], Class.prototype, "pointerClass", null);
  __decorate([
    lazy
  ], Class.prototype, "rank", null);
  __decorate([
    lazy
  ], Class.prototype, "staticFieldsData", null);
  __decorate([
    lazy
  ], Class.prototype, "valueTypeSize", null);
  __decorate([
    lazy
  ], Class.prototype, "type", null);
  Class = __decorate([
    recycle
  ], Class);
  Il2Cpp3.Class = Class;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function delegate(klass, block) {
    const SystemDelegate = Il2Cpp3.corlib.class("System.Delegate");
    const SystemMulticastDelegate = Il2Cpp3.corlib.class("System.MulticastDelegate");
    if (!SystemDelegate.isAssignableFrom(klass)) {
      raise(`cannot create a delegate for ${klass.type.name} as it's a non-delegate class`);
    }
    if (klass.equals(SystemDelegate) || klass.equals(SystemMulticastDelegate)) {
      raise(`cannot create a delegate for neither ${SystemDelegate.type.name} nor ${SystemMulticastDelegate.type.name}, use a subclass instead`);
    }
    const delegate2 = klass.alloc();
    const key = delegate2.handle.toString();
    const Invoke = delegate2.tryMethod("Invoke") ?? raise(`cannot create a delegate for ${klass.type.name}, there is no Invoke method`);
    delegate2.method(".ctor").invoke(delegate2, Invoke.handle);
    const callback = Invoke.wrap(block);
    delegate2.field("method_ptr").value = callback;
    delegate2.field("invoke_impl").value = callback;
    Il2Cpp3._callbacksToKeepAlive[key] = callback;
    return delegate2;
  }
  Il2Cpp3.delegate = delegate;
  Il2Cpp3._callbacksToKeepAlive = {};
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Domain = class Domain extends NativeStruct {
    /** Gets the assemblies that have been loaded into the execution context of the application domain. */
    get assemblies() {
      let handles = readNativeList((_) => Il2Cpp3.exports.domainGetAssemblies(this, _));
      if (handles.length == 0) {
        const assemblyObjects = this.object.method("GetAssemblies").overload().invoke();
        handles = globalThis.Array.from(assemblyObjects).map((_) => _.field("_mono_assembly").value);
      }
      return handles.map((_) => new Il2Cpp3.Assembly(_));
    }
    /** Gets the encompassing object of the application domain. */
    get object() {
      return Il2Cpp3.corlib.class("System.AppDomain").method("get_CurrentDomain").invoke();
    }
    /** Opens and loads the assembly with the given name. */
    assembly(name) {
      return this.tryAssembly(name) ?? raise(`couldn't find assembly ${name}`);
    }
    /** Attached a new thread to the application domain. */
    attach() {
      return new Il2Cpp3.Thread(Il2Cpp3.exports.threadAttach(this));
    }
    /** Opens and loads the assembly with the given name. */
    tryAssembly(name) {
      return new Il2Cpp3.Assembly(Il2Cpp3.exports.domainGetAssemblyFromName(this, Memory.allocUtf8String(name))).asNullable();
    }
  };
  __decorate([
    lazy
  ], Domain.prototype, "assemblies", null);
  __decorate([
    lazy
  ], Domain.prototype, "object", null);
  Domain = __decorate([
    recycle
  ], Domain);
  Il2Cpp3.Domain = Domain;
  getter(Il2Cpp3, "domain", () => {
    return new Il2Cpp3.Domain(Il2Cpp3.exports.domainGet());
  }, lazy);
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Field extends NativeStruct {
    /** Gets the class in which this field is defined. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.fieldGetClass(this));
    }
    /** Gets the flags of the current field. */
    get flags() {
      return Il2Cpp3.exports.fieldGetFlags(this);
    }
    /** Determines whether this field value is known at compile time. */
    get isLiteral() {
      return (this.flags & 64) != 0;
    }
    /** Determines whether this field is static. */
    get isStatic() {
      return (this.flags & 16) != 0;
    }
    /** Determines whether this field is thread static. */
    get isThreadStatic() {
      const offset = Il2Cpp3.corlib.class("System.AppDomain").field("type_resolve_in_progress").offset;
      getter(Il2Cpp3.Field.prototype, "isThreadStatic", function() {
        return this.offset == offset;
      }, lazy);
      return this.isThreadStatic;
    }
    /** Gets the access modifier of this field. */
    get modifier() {
      switch (this.flags & 7) {
        case 1:
          return "private";
        case 2:
          return "private protected";
        case 3:
          return "internal";
        case 4:
          return "protected";
        case 5:
          return "protected internal";
        case 6:
          return "public";
      }
    }
    /** Gets the name of this field. */
    get name() {
      return Il2Cpp3.exports.fieldGetName(this).readUtf8String();
    }
    /** Gets the offset of this field, calculated as the difference with its owner virtual address. */
    get offset() {
      return Il2Cpp3.exports.fieldGetOffset(this);
    }
    /** Gets the type of this field. */
    get type() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.fieldGetType(this));
    }
    /** Gets the value of this field. */
    get value() {
      if (!this.isStatic) {
        raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
      }
      const handle = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.fieldGetStaticValue(this.handle, handle);
      return Il2Cpp3.read(handle, this.type);
    }
    /** Sets the value of this field. Thread static or literal values cannot be altered yet. */
    set value(value) {
      if (!this.isStatic) {
        raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
      }
      if (this.isThreadStatic || this.isLiteral) {
        raise(`cannot write the value of field ${this.name} as it's thread static or literal`);
      }
      const handle = (
        // pointer-like values should be passed as-is, but boxed
        // value types (primitives included) must be unboxed first
        value instanceof Il2Cpp3.Object && this.type.class.isValueType ? value.unbox() : value instanceof NativeStruct ? value.handle : value instanceof NativePointer ? value : Il2Cpp3.write(Memory.alloc(this.type.class.valueTypeSize), value, this.type)
      );
      Il2Cpp3.exports.fieldSetStaticValue(this.handle, handle);
    }
    /** */
    toString() {
      return `${this.isThreadStatic ? `[ThreadStatic] ` : ``}${this.isStatic ? `static ` : ``}${this.type.name} ${this.name}${this.isLiteral ? ` = ${this.type.class.isEnum ? Il2Cpp3.read(this.value.handle, this.type.class.baseType) : this.value}` : ``};${this.isThreadStatic || this.isLiteral ? `` : ` // 0x${this.offset.toString(16)}`}`;
    }
    /**
     * @internal
     * Binds the current field to a {@link Il2Cpp.Object} or a
     * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
     * possible to retrieve its value - see {@link Il2Cpp.Field.value} for
     * details. \
     * Binding a static field is forbidden.
     */
    bind(instance) {
      if (this.isStatic) {
        raise(`cannot bind static field ${this.class.type.name}::${this.name} to an instance`);
      }
      const offset = this.offset - (instance instanceof Il2Cpp3.ValueType ? Il2Cpp3.Object.headerSize : 0);
      return new Proxy(this, {
        get(target, property) {
          if (property == "value") {
            return Il2Cpp3.read(instance.handle.add(offset), target.type);
          }
          return Reflect.get(target, property);
        },
        set(target, property, value) {
          if (property == "value") {
            Il2Cpp3.write(instance.handle.add(offset), value, target.type);
            return true;
          }
          return Reflect.set(target, property, value);
        }
      });
    }
  }
  __decorate([
    lazy
  ], Field.prototype, "class", null);
  __decorate([
    lazy
  ], Field.prototype, "flags", null);
  __decorate([
    lazy
  ], Field.prototype, "isLiteral", null);
  __decorate([
    lazy
  ], Field.prototype, "isStatic", null);
  __decorate([
    lazy
  ], Field.prototype, "isThreadStatic", null);
  __decorate([
    lazy
  ], Field.prototype, "modifier", null);
  __decorate([
    lazy
  ], Field.prototype, "name", null);
  __decorate([
    lazy
  ], Field.prototype, "offset", null);
  __decorate([
    lazy
  ], Field.prototype, "type", null);
  Il2Cpp3.Field = Field;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class GCHandle {
    handle;
    /** @internal */
    constructor(handle) {
      this.handle = handle;
    }
    /** Gets the object associated to this handle. */
    get target() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.gcHandleGetTarget(this.handle)).asNullable();
    }
    /** Frees this handle. */
    free() {
      return Il2Cpp3.exports.gcHandleFree(this.handle);
    }
  }
  Il2Cpp3.GCHandle = GCHandle;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Image = class Image extends NativeStruct {
    /** Gets the assembly in which the current image is defined. */
    get assembly() {
      return new Il2Cpp3.Assembly(Il2Cpp3.exports.imageGetAssembly(this));
    }
    /** Gets the amount of classes defined in this image. */
    get classCount() {
      if (Il2Cpp3.exports.imageGetClassCount.isNull()) {
        return this.classes.length;
      } else {
        return Il2Cpp3.exports.imageGetClassCount(this);
      }
    }
    /** Gets the classes defined in this image. */
    get classes() {
      if (Il2Cpp3.exports.imageGetClass.isNull()) {
        const types = this.assembly.object.method("GetTypes").invoke(false);
        const classes = globalThis.Array.from(types, (_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
        const Module = this.tryClass("<Module>");
        if (Module) {
          classes.unshift(Module);
        }
        return classes;
      } else {
        return globalThis.Array.from(globalThis.Array(this.classCount), (_, i) => new Il2Cpp3.Class(Il2Cpp3.exports.imageGetClass(this, i)));
      }
    }
    /** Gets the name of this image. */
    get name() {
      return Il2Cpp3.exports.imageGetName(this).readUtf8String();
    }
    /** Gets the class with the specified name defined in this image. */
    class(name) {
      return this.tryClass(name) ?? raise(`couldn't find class ${name} in assembly ${this.name}`);
    }
    /** Gets the class with the specified name defined in this image. */
    tryClass(name) {
      const dotIndex = name.lastIndexOf(".");
      const classNamespace = Memory.allocUtf8String(dotIndex == -1 ? "" : name.slice(0, dotIndex));
      const className = Memory.allocUtf8String(name.slice(dotIndex + 1));
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromName(this, classNamespace, className)).asNullable();
    }
  };
  __decorate([
    lazy
  ], Image.prototype, "assembly", null);
  __decorate([
    lazy
  ], Image.prototype, "classCount", null);
  __decorate([
    lazy
  ], Image.prototype, "classes", null);
  __decorate([
    lazy
  ], Image.prototype, "name", null);
  Image = __decorate([
    recycle
  ], Image);
  Il2Cpp3.Image = Image;
  getter(Il2Cpp3, "corlib", () => {
    return new Il2Cpp3.Image(Il2Cpp3.exports.getCorlib());
  }, lazy);
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class MemorySnapshot extends NativeStruct {
    /** Captures a memory snapshot. */
    static capture() {
      return new Il2Cpp3.MemorySnapshot();
    }
    /** Creates a memory snapshot with the given handle. */
    constructor(handle = Il2Cpp3.exports.memorySnapshotCapture()) {
      super(handle);
    }
    /** Gets any initialized class. */
    get classes() {
      return readNativeIterator((_) => Il2Cpp3.exports.memorySnapshotGetClasses(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the objects tracked by this memory snapshot. */
    get objects() {
      return readNativeList((_) => Il2Cpp3.exports.memorySnapshotGetObjects(this, _)).filter((_) => !_.isNull()).map((_) => new Il2Cpp3.Object(_));
    }
    /** Frees this memory snapshot. */
    free() {
      Il2Cpp3.exports.memorySnapshotFree(this);
    }
  }
  __decorate([
    lazy
  ], MemorySnapshot.prototype, "classes", null);
  __decorate([
    lazy
  ], MemorySnapshot.prototype, "objects", null);
  Il2Cpp3.MemorySnapshot = MemorySnapshot;
  function memorySnapshot(block) {
    const memorySnapshot2 = Il2Cpp3.MemorySnapshot.capture();
    const result = block(memorySnapshot2);
    memorySnapshot2.free();
    return result;
  }
  Il2Cpp3.memorySnapshot = memorySnapshot;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Method extends NativeStruct {
    /** Gets the class in which this method is defined. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.methodGetClass(this));
    }
    /** Gets the flags of the current method. */
    get flags() {
      return Il2Cpp3.exports.methodGetFlags(this, NULL);
    }
    /** Gets the implementation flags of the current method. */
    get implementationFlags() {
      const implementationFlagsPointer = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.methodGetFlags(this, implementationFlagsPointer);
      return implementationFlagsPointer.readU32();
    }
    /** */
    get fridaSignature() {
      const types = [];
      for (const parameter of this.parameters) {
        types.push(parameter.type.fridaAlias);
      }
      if (this.nativeSignatureHasInstanceSlot) {
        types.unshift("pointer");
      }
      if (this.isInflated) {
        types.push("pointer");
      }
      return types;
    }
    /** Gets the generic parameters of this generic method. */
    get generics() {
      if (!this.isGeneric) {
        return [];
      }
      const types = this.object.method("GetGenericArguments").invoke();
      return globalThis.Array.from(types).map((_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
    }
    /** Determines whether this method is external. */
    get isExternal() {
      return (this.implementationFlags & 4096) != 0;
    }
    /** Determines whether this method is generic. */
    get isGeneric() {
      return !!Il2Cpp3.exports.methodIsGeneric(this);
    }
    /** Determines whether this method is inflated (generic with a concrete type parameter). */
    get isInflated() {
      return !!Il2Cpp3.exports.methodIsInflated(this);
    }
    /** Determines whether this method is static. */
    get isStatic() {
      return !Il2Cpp3.exports.methodIsInstance(this);
    }
    /** Determines whether this method is synchronized. */
    get isSynchronized() {
      return (this.implementationFlags & 32) != 0;
    }
    /** Gets the access modifier of this method. */
    get modifier() {
      switch (this.flags & 7) {
        case 1:
          return "private";
        case 2:
          return "private protected";
        case 3:
          return "internal";
        case 4:
          return "protected";
        case 5:
          return "protected internal";
        case 6:
          return "public";
      }
    }
    /** Gets the name of this method. */
    get name() {
      return Il2Cpp3.exports.methodGetName(this).readUtf8String();
    }
    /** @internal */
    get nativeFunction() {
      return new NativeFunction(this.virtualAddress, this.returnType.fridaAlias, this.fridaSignature);
    }
    /** @internal */
    get nativeSignatureHasInstanceSlot() {
      return !this.isStatic || staticMethodsRequireInstanceParam();
    }
    /** Gets the encompassing object of the current method. */
    get object() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.methodGetObject(this, NULL));
    }
    /** Gets the amount of parameters of this method. */
    get parameterCount() {
      return Il2Cpp3.exports.methodGetParameterCount(this);
    }
    /** Gets the parameters of this method. */
    get parameters() {
      return globalThis.Array.from(globalThis.Array(this.parameterCount), (_, i) => {
        const parameterName = Il2Cpp3.exports.methodGetParameterName(this, i).readUtf8String();
        const parameterType = Il2Cpp3.exports.methodGetParameterType(this, i);
        return new Il2Cpp3.Parameter(parameterName, i, new Il2Cpp3.Type(parameterType));
      });
    }
    /** Gets the relative virtual address (RVA) of this method. */
    get relativeVirtualAddress() {
      return this.virtualAddress.sub(Il2Cpp3.module.base);
    }
    /** Gets the return type of this method. */
    get returnType() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.methodGetReturnType(this));
    }
    /** Gets the virtual address (VA) of this method. */
    get virtualAddress() {
      const offset = virtualAddressOffset();
      getter(Il2Cpp3.Method.prototype, "virtualAddress", function() {
        return this.handle.add(offset).readPointer();
      }, lazy);
      Il2Cpp3.corlib.class("System.Reflection.Module").method(".cctor").invoke();
      return this.virtualAddress;
    }
    /** Replaces the body of this method. */
    set implementation(block) {
      try {
        Interceptor.replace(this.virtualAddress, this.wrap(block));
      } catch (e) {
        switch (e.message) {
          case "access violation accessing 0x0":
            raise(`couldn't set implementation for method ${this.name} as it has a NULL virtual address`);
          case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
            warn(`couldn't set implementation for method ${this.name} as it may be a thunk`);
            break;
          case "already replaced this function":
            warn(`couldn't set implementation for method ${this.name} as it has already been replaced by a thunk`);
            break;
          default:
            throw e;
        }
      }
    }
    /** Creates a generic instance of the current generic method. */
    inflate(...classes) {
      if (!this.isGeneric || this.generics.length != classes.length) {
        for (const method of this.overloads()) {
          if (method.isGeneric && method.generics.length == classes.length) {
            return method.inflate(...classes);
          }
        }
        raise(`could not find inflatable signature of method ${this.name} with ${classes.length} generic parameter(s)`);
      }
      const types = classes.map((_) => _.type.object);
      const typeArray = Il2Cpp3.array(Il2Cpp3.corlib.class("System.Type"), types);
      const inflatedMethodObject = this.object.method("MakeGenericMethod", 1).invoke(typeArray);
      return new Il2Cpp3.Method(inflatedMethodObject.field("mhandle").value);
    }
    /** Invokes this method. */
    invoke(...parameters) {
      if (!this.isStatic) {
        raise(`cannot invoke non-static method ${this.name} as it must be invoked throught a Il2Cpp.Object, not a Il2Cpp.Class`);
      }
      return this.invokeRaw(NULL, ...parameters);
    }
    /** @internal */
    invokeRaw(instance, ...parameters) {
      const allocatedParameters = parameters.map(Il2Cpp3.toFridaValue);
      if (this.nativeSignatureHasInstanceSlot) {
        allocatedParameters.unshift(instance);
      }
      if (this.isInflated) {
        allocatedParameters.push(this.handle);
      }
      try {
        const returnValue = this.nativeFunction(...allocatedParameters);
        return Il2Cpp3.fromFridaValue(returnValue, this.returnType);
      } catch (e) {
        if (e == null) {
          raise("an unexpected native invocation exception occurred, this is due to parameter types mismatch");
        }
        switch (e.message) {
          case "bad argument count":
            raise(`couldn't invoke method ${this.name} as it needs ${this.parameterCount} parameter(s), not ${parameters.length}`);
          case "expected a pointer":
          case "expected number":
          case "expected array with fields":
            raise(`couldn't invoke method ${this.name} using incorrect parameter types`);
        }
        throw e;
      }
    }
    /** Gets the overloaded method with the given parameter types. */
    overload(...typeNamesOrClasses) {
      const method = this.tryOverload(...typeNamesOrClasses);
      return method ?? raise(`couldn't find overloaded method ${this.name}(${typeNamesOrClasses.map((_) => _ instanceof Il2Cpp3.Class ? _.type.name : _)})`);
    }
    /** @internal */
    *overloads() {
      for (const klass of this.class.hierarchy()) {
        for (const method of klass.methods) {
          if (this.name == method.name) {
            yield method;
          }
        }
      }
    }
    /** Gets the parameter with the given name. */
    parameter(name) {
      return this.tryParameter(name) ?? raise(`couldn't find parameter ${name} in method ${this.name}`);
    }
    /** Restore the original method implementation. */
    revert() {
      Interceptor.revert(this.virtualAddress);
      Interceptor.flush();
    }
    /** Gets the overloaded method with the given parameter types. */
    tryOverload(...typeNamesOrClasses) {
      const minScore = typeNamesOrClasses.length * 1;
      const maxScore = typeNamesOrClasses.length * 2;
      let candidate = void 0;
      loop: for (const method of this.overloads()) {
        if (method.parameterCount != typeNamesOrClasses.length)
          continue;
        let score = 0;
        let i = 0;
        for (const parameter of method.parameters) {
          const desiredTypeNameOrClass = typeNamesOrClasses[i];
          if (desiredTypeNameOrClass instanceof Il2Cpp3.Class) {
            if (parameter.type.is(desiredTypeNameOrClass.type)) {
              score += 2;
            } else if (parameter.type.class.isAssignableFrom(desiredTypeNameOrClass)) {
              score += 1;
            } else {
              continue loop;
            }
          } else if (parameter.type.name == desiredTypeNameOrClass) {
            score += 2;
          } else {
            continue loop;
          }
          i++;
        }
        if (score < minScore) {
          continue;
        } else if (score == maxScore) {
          return method;
        } else if (candidate == void 0 || score > candidate[0]) {
          candidate = [score, method];
        } else if (score == candidate[0]) {
          let i2 = 0;
          for (const parameter of candidate[1].parameters) {
            if (parameter.type.class.isAssignableFrom(method.parameters[i2].type.class)) {
              candidate = [score, method];
              continue loop;
            }
            i2++;
          }
        }
      }
      return candidate?.[1];
    }
    /** Gets the parameter with the given name. */
    tryParameter(name) {
      return this.parameters.find((_) => _.name == name);
    }
    /** */
    toString() {
      return `${this.isStatic ? `static ` : ``}${this.returnType.name} ${this.name}${this.generics.length > 0 ? `<${this.generics.map((_) => _.type.name).join(",")}>` : ""}(${this.parameters.join(`, `)});${this.virtualAddress.isNull() ? `` : ` // 0x${this.relativeVirtualAddress.toString(16).padStart(8, `0`)}`}`;
    }
    /**
     * @internal
     * Binds the current method to a {@link Il2Cpp.Object} or a
     * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
     * possible to invoke it - see {@link Il2Cpp.Method.invoke} for
     * details. \
     * Binding a static method is forbidden.
     */
    bind(instance) {
      if (this.isStatic) {
        raise(`cannot bind static method ${this.class.type.name}::${this.name} to an instance`);
      }
      return new Proxy(this, {
        get(target, property, receiver) {
          switch (property) {
            case "invoke":
              const handle = instance instanceof Il2Cpp3.ValueType ? target.class.isValueType ? instance.handle.sub(structMethodsRequireObjectInstances() ? Il2Cpp3.Object.headerSize : 0) : raise(`cannot invoke method ${target.class.type.name}::${target.name} against a value type, you must box it first`) : target.class.isValueType ? instance.handle.add(structMethodsRequireObjectInstances() ? 0 : Il2Cpp3.Object.headerSize) : instance.handle;
              return target.invokeRaw.bind(target, handle);
            case "overloads":
              return function* () {
                for (const method of target[property]()) {
                  if (!method.isStatic) {
                    yield method;
                  }
                }
              };
            case "inflate":
            case "overload":
            case "tryOverload":
              const member = Reflect.get(target, property).bind(receiver);
              return function(...args) {
                return member(...args)?.bind(instance);
              };
          }
          return Reflect.get(target, property);
        }
      });
    }
    /** @internal */
    wrap(block) {
      const parameterStartIndex = +this.nativeSignatureHasInstanceSlot;
      return new NativeCallback((...args) => {
        const thisObject = this.isStatic ? this.class : this.class.isValueType ? new Il2Cpp3.ValueType(args[0].add(structMethodsRequireObjectInstances() ? Il2Cpp3.Object.headerSize : 0), this.class.type) : new Il2Cpp3.Object(args[0]);
        const parameters = this.parameters.map((_, i) => Il2Cpp3.fromFridaValue(args[i + parameterStartIndex], _.type));
        const result = block.call(thisObject, ...parameters);
        return Il2Cpp3.toFridaValue(result);
      }, this.returnType.fridaAlias, this.fridaSignature);
    }
    /**
     * Attempts to find a {@link Il2Cpp.Method} given its virtual address, that is, the native
     * function's first instruction address.
     *
     * Please note that different generic methods (or methods belonging to generic classes) may
     * share the same virtual address due to IL2CPP generic sharing: as a consequence, an
     * unexpected `Il2Cpp.Method` might be returned. However, such shared virtual addresses are
     * not actually invocable, so any address taken from runtime execution (e.g. from tracing)
     * is not affected.
     *
     * To resolve a method from any address within the native function body, use
     * {@link Il2Cpp.Method.fromAnyAddress}.
     * ```ts
     * const virtualAddress: NativePointer = ...;
     * Il2Cpp.Method.fromVirtualAddress(virtualAddress);
     * ```
     */
    static fromVirtualAddress(virtualAddress) {
      return this.tryFromVirtualAddress(virtualAddress) ?? raise(`couldn't find method at virtual address ${virtualAddress}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromVirtualAddress}, but returns `undefined` if no method
     * is found.
     * ```ts
     * const virtualAddress: NativePointer = ...;
     * Il2Cpp.Method.tryFromVirtualAddress(virtualAddress);
     * ```
     */
    static tryFromVirtualAddress(virtualAddress) {
      if (virtualAddress.isNull()) {
        raise("method virtual address cannot be null");
      }
      const rangeProvider = function* () {
        yield* rangesHavingMethodDefinitionsCache.values();
        yield* Process.enumerateRanges("rw-").filter((_) => _.file == void 0);
      };
      for (const range of rangeProvider()) {
        let matches;
        try {
          matches = Memory.scanSync(range.base, range.size, virtualAddress.toMatchPattern());
        } catch (_) {
          continue;
        }
        for (const { address } of matches) {
          const method = new Il2Cpp3.Method(address.sub(virtualAddressOffset()));
          try {
            if (method.name == null) {
              continue;
            }
          } catch (_) {
            continue;
          }
          const currentRange = rangesHavingMethodDefinitionsCache.get(range.base.toInt32());
          if (currentRange == void 0 || currentRange.size != range.size) {
            rangesHavingMethodDefinitionsCache.set(range.base.toInt32(), range);
          }
          return method;
        }
      }
    }
    /**
     * Attempts to find a {@link Il2Cpp.Method} given its relative virtual address, that is,
     * the native function's first instruction offset from the IL2CPP module base.
     * ```ts
     * Il2Cpp.Method.fromRelativeVirtualAddress("0x004ac1e");
     * ```
     */
    static fromRelativeVirtualAddress(relativeVirtualAddress) {
      return this.tryFromRelativeVirtualAddress(relativeVirtualAddress) ?? raise(`couldn't find method with RVA 0x${relativeVirtualAddress.toString(16)}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromRelativeVirtualAddress}, but returns `undefined`
     * if no method is found.
     * ```ts
     * Il2Cpp.Method.tryFromVirtualAddress("0x004ac1e");
     * ```
     */
    static tryFromRelativeVirtualAddress(relativeVirtualAddress) {
      return this.tryFromVirtualAddress(Il2Cpp3.module.base.add(ptr(relativeVirtualAddress)));
    }
    /**
     * Attempts to find the {@link Il2Cpp.Method} whose native function contains the given
     * address.
     * Unlike {@link Il2Cpp.Method.fromVirtualAddress}, this accepts any address within the
     * native function body, not only its first instruction address.
     *
     * This combines {@link Process.findFunctionRange} and
     * {@link Il2Cpp.Method.fromVirtualAddress}.
     * ```ts
     * const address: NativePointer = ...;
     * Il2Cpp.Method.fromAnyAddress(address);
     * ```
     */
    static fromAnyAddress(address) {
      return this.tryFromAnyAddress(address) ?? raise(`couldn't find method containing address ${address}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromAnyAddress}, but returns `undefined` if no method
     * is found.
     * ```ts
     * const address: NativePointer = ...;
     * Il2Cpp.Method.tryFromAnyAddress(address);
     * ```
     */
    static tryFromAnyAddress(address) {
      const range = Process.findFunctionRange(address);
      return range == null ? void 0 : this.tryFromVirtualAddress(range.base);
    }
  }
  __decorate([
    lazy
  ], Method.prototype, "class", null);
  __decorate([
    lazy
  ], Method.prototype, "flags", null);
  __decorate([
    lazy
  ], Method.prototype, "implementationFlags", null);
  __decorate([
    lazy
  ], Method.prototype, "fridaSignature", null);
  __decorate([
    lazy
  ], Method.prototype, "generics", null);
  __decorate([
    lazy
  ], Method.prototype, "isExternal", null);
  __decorate([
    lazy
  ], Method.prototype, "isGeneric", null);
  __decorate([
    lazy
  ], Method.prototype, "isInflated", null);
  __decorate([
    lazy
  ], Method.prototype, "isStatic", null);
  __decorate([
    lazy
  ], Method.prototype, "isSynchronized", null);
  __decorate([
    lazy
  ], Method.prototype, "modifier", null);
  __decorate([
    lazy
  ], Method.prototype, "name", null);
  __decorate([
    lazy
  ], Method.prototype, "nativeFunction", null);
  __decorate([
    lazy
  ], Method.prototype, "object", null);
  __decorate([
    lazy
  ], Method.prototype, "parameterCount", null);
  __decorate([
    lazy
  ], Method.prototype, "parameters", null);
  __decorate([
    lazy
  ], Method.prototype, "relativeVirtualAddress", null);
  __decorate([
    lazy
  ], Method.prototype, "returnType", null);
  Il2Cpp3.Method = Method;
  let staticMethodsRequireInstanceParam = () => {
    const SystemObject = Il2Cpp3.corlib.class("System.Object");
    const Equals = new NativeFunction(SystemObject.method("Equals", 2).virtualAddress, "bool", ["pointer", "pointer"]);
    const sentinel = SystemObject.new();
    const equality = Equals(sentinel, sentinel);
    const result = !equality;
    return (staticMethodsRequireInstanceParam = () => result)();
  };
  let structMethodsRequireObjectInstances = () => {
    const object = Il2Cpp3.corlib.class("System.Int64").alloc();
    object.field("m_value").value = 3735928559;
    const result = object.method("Equals", 1).overload(object.class).invokeRaw(object, 3735928559);
    return (structMethodsRequireObjectInstances = () => result)();
  };
  let virtualAddressOffset = () => {
    const FilterTypeName = Il2Cpp3.corlib.class("System.Reflection.Module").initialize().field("FilterTypeName").value;
    const FilterTypeNameMethodPointer = FilterTypeName.field("method_ptr").value;
    const FilterTypeNameMethod = FilterTypeName.field("method").value;
    const offset = FilterTypeNameMethod.offsetOf((_) => _.readPointer().equals(FilterTypeNameMethodPointer)) ?? raise("couldn't find the virtual address offset in the native method struct");
    return (virtualAddressOffset = () => offset)();
  };
  const rangesHavingMethodDefinitionsCache = /* @__PURE__ */ new Map();
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Object2 extends NativeStruct {
    /** Gets the Il2CppObject struct size, possibly equal to `Process.pointerSize * 2`. */
    static get headerSize() {
      return Il2Cpp3.corlib.class("System.Object").instanceSize;
    }
    /**
     * Returns the same object, but having its parent class as class.
     * It basically is the C# `base` keyword, so that parent members can be
     * accessed.
     *
     * **Example** \
     * Consider the following classes:
     * ```csharp
     * class Foo
     * {
     *     int foo()
     *     {
     *          return 1;
     *     }
     * }
     * class Bar : Foo
     * {
     *     new int foo()
     *     {
     *          return 2;
     *     }
     * }
     * ```
     * then:
     * ```ts
     * const Bar: Il2Cpp.Class = ...;
     * const bar = Bar.new();
     *
     * console.log(bar.foo()); // 2
     * console.log(bar.base.foo()); // 1
     * ```
     */
    get base() {
      if (this.class.parent == null) {
        raise(`class ${this.class.type.name} has no parent`);
      }
      return new Proxy(this, {
        get(target, property, receiver) {
          if (property == "class") {
            return Reflect.get(target, property).parent;
          } else if (property == "base") {
            return Reflect.getOwnPropertyDescriptor(Il2Cpp3.Object.prototype, property).get.bind(receiver)();
          }
          return Reflect.get(target, property);
        }
      });
    }
    /** Gets the class of this object. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.objectGetClass(this));
    }
    /** Returns a monitor for this object. */
    get monitor() {
      return new Il2Cpp3.Object.Monitor(this);
    }
    /** Gets the size of the current object. */
    get size() {
      return Il2Cpp3.exports.objectGetSize(this);
    }
    /** Gets the non-static field with the given name of the current class hierarchy. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.class.type.name}`);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.class.type.name}`);
    }
    /** Creates a reference to this object. */
    ref(pin) {
      return new Il2Cpp3.GCHandle(Il2Cpp3.exports.gcHandleNew(this, +pin));
    }
    /** Gets the correct virtual method from the given virtual method. */
    virtualMethod(method) {
      return new Il2Cpp3.Method(Il2Cpp3.exports.objectGetVirtualMethod(this, method)).bind(this);
    }
    /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
    tryField(name) {
      const field = this.class.tryField(name);
      if (field?.isStatic) {
        for (const klass of this.class.hierarchy({ includeCurrent: false })) {
          for (const field2 of klass.fields) {
            if (field2.name == name && !field2.isStatic) {
              return field2.bind(this);
            }
          }
        }
        return void 0;
      }
      return field?.bind(this);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
    tryMethod(name, parameterCount = -1) {
      const method = this.class.tryMethod(name, parameterCount);
      if (method?.isStatic) {
        for (const klass of this.class.hierarchy()) {
          for (const method2 of klass.methods) {
            if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
              return method2.bind(this);
            }
          }
        }
        return void 0;
      }
      return method?.bind(this);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : this.method("ToString", 0).invoke().content ?? "null";
    }
    /** Unboxes the value type (either a primitive, a struct or an enum) out of this object. */
    unbox() {
      return this.class.isValueType ? new Il2Cpp3.ValueType(Il2Cpp3.exports.objectUnbox(this), this.class.type) : raise(`couldn't unbox instances of ${this.class.type.name} as they are not value types`);
    }
    /** Creates a weak reference to this object. */
    weakRef(trackResurrection) {
      return new Il2Cpp3.GCHandle(Il2Cpp3.exports.gcHandleNewWeakRef(this, +trackResurrection));
    }
  }
  __decorate([
    lazy
  ], Object2.prototype, "class", null);
  __decorate([
    lazy
  ], Object2.prototype, "size", null);
  __decorate([
    lazy
  ], Object2, "headerSize", null);
  Il2Cpp3.Object = Object2;
  (function(Object3) {
    class Monitor {
      handle;
      /** @internal */
      constructor(handle) {
        this.handle = handle;
      }
      /** Acquires an exclusive lock on the current object. */
      enter() {
        return Il2Cpp3.exports.monitorEnter(this.handle);
      }
      /** Release an exclusive lock on the current object. */
      exit() {
        return Il2Cpp3.exports.monitorExit(this.handle);
      }
      /** Notifies a thread in the waiting queue of a change in the locked object's state. */
      pulse() {
        return Il2Cpp3.exports.monitorPulse(this.handle);
      }
      /** Notifies all waiting threads of a change in the object's state. */
      pulseAll() {
        return Il2Cpp3.exports.monitorPulseAll(this.handle);
      }
      /** Attempts to acquire an exclusive lock on the current object. */
      tryEnter(timeout) {
        return !!Il2Cpp3.exports.monitorTryEnter(this.handle, timeout);
      }
      /** Releases the lock on an object and attempts to block the current thread until it reacquires the lock. */
      tryWait(timeout) {
        return !!Il2Cpp3.exports.monitorTryWait(this.handle, timeout);
      }
      /** Releases the lock on an object and blocks the current thread until it reacquires the lock. */
      wait() {
        return Il2Cpp3.exports.monitorWait(this.handle);
      }
    }
    Object3.Monitor = Monitor;
  })(Object2 = Il2Cpp3.Object || (Il2Cpp3.Object = {}));
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Parameter {
    /** Name of this parameter. */
    name;
    /** Position of this parameter. */
    position;
    /** Type of this parameter. */
    type;
    constructor(name, position, type) {
      this.name = name;
      this.position = position;
      this.type = type;
    }
    /** */
    toString() {
      return `${this.type.name} ${this.name}`;
    }
  }
  Il2Cpp3.Parameter = Parameter;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Pointer extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Gets the element at the given index. */
    get(index) {
      return Il2Cpp3.read(this.handle.add(index * this.type.class.arrayElementSize), this.type);
    }
    /** Reads the given amount of elements starting at the given offset. */
    read(length, offset = 0) {
      const values = new globalThis.Array(length);
      for (let i = 0; i < length; i++) {
        values[i] = this.get(i + offset);
      }
      return values;
    }
    /** Sets the given element at the given index */
    set(index, value) {
      Il2Cpp3.write(this.handle.add(index * this.type.class.arrayElementSize), value, this.type);
    }
    /** */
    toString() {
      return this.handle.toString();
    }
    /** Writes the given elements starting at the given index. */
    write(values, offset = 0) {
      for (let i = 0; i < values.length; i++) {
        this.set(i + offset, values[i]);
      }
    }
  }
  Il2Cpp3.Pointer = Pointer;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Reference extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Gets the element referenced by the current reference. */
    get value() {
      return Il2Cpp3.read(this.handle, this.type);
    }
    /** Sets the element referenced by the current reference. */
    set value(value) {
      Il2Cpp3.write(this.handle, value, this.type);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `->${this.value}`;
    }
  }
  Il2Cpp3.Reference = Reference;
  function reference(value, type) {
    const handle = Memory.alloc(Process.pointerSize);
    switch (typeof value) {
      case "boolean":
        return new Il2Cpp3.Reference(handle.writeS8(+value), Il2Cpp3.corlib.class("System.Boolean").type);
      case "number":
        switch (type?.enumValue) {
          case Il2Cpp3.Type.Enum.UBYTE:
            return new Il2Cpp3.Reference(handle.writeU8(value), type);
          case Il2Cpp3.Type.Enum.BYTE:
            return new Il2Cpp3.Reference(handle.writeS8(value), type);
          case Il2Cpp3.Type.Enum.CHAR:
          case Il2Cpp3.Type.Enum.USHORT:
            return new Il2Cpp3.Reference(handle.writeU16(value), type);
          case Il2Cpp3.Type.Enum.SHORT:
            return new Il2Cpp3.Reference(handle.writeS16(value), type);
          case Il2Cpp3.Type.Enum.UINT:
            return new Il2Cpp3.Reference(handle.writeU32(value), type);
          case Il2Cpp3.Type.Enum.INT:
            return new Il2Cpp3.Reference(handle.writeS32(value), type);
          case Il2Cpp3.Type.Enum.ULONG:
            return new Il2Cpp3.Reference(handle.writeU64(value), type);
          case Il2Cpp3.Type.Enum.LONG:
            return new Il2Cpp3.Reference(handle.writeS64(value), type);
          case Il2Cpp3.Type.Enum.FLOAT:
            return new Il2Cpp3.Reference(handle.writeFloat(value), type);
          case Il2Cpp3.Type.Enum.DOUBLE:
            return new Il2Cpp3.Reference(handle.writeDouble(value), type);
        }
      case "object":
        if (value instanceof Il2Cpp3.ValueType || value instanceof Il2Cpp3.Pointer) {
          return new Il2Cpp3.Reference(value.handle, value.type);
        } else if (value instanceof Il2Cpp3.Object) {
          return new Il2Cpp3.Reference(handle.writePointer(value), value.class.type);
        } else if (value instanceof Il2Cpp3.String || value instanceof Il2Cpp3.Array) {
          return new Il2Cpp3.Reference(handle.writePointer(value), value.object.class.type);
        } else if (value instanceof NativePointer) {
          switch (type?.enumValue) {
            case Il2Cpp3.Type.Enum.NUINT:
            case Il2Cpp3.Type.Enum.NINT:
              return new Il2Cpp3.Reference(handle.writePointer(value), type);
          }
        } else if (value instanceof Int64) {
          return new Il2Cpp3.Reference(handle.writeS64(value), Il2Cpp3.corlib.class("System.Int64").type);
        } else if (value instanceof UInt64) {
          return new Il2Cpp3.Reference(handle.writeU64(value), Il2Cpp3.corlib.class("System.UInt64").type);
        }
      default:
        raise(`couldn't create a reference to ${value} using an unhandled type ${type?.name}`);
    }
  }
  Il2Cpp3.reference = reference;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class String2 extends NativeStruct {
    /** Gets the content of this string. */
    get content() {
      return Il2Cpp3.exports.stringGetChars(this).readUtf16String(this.length);
    }
    /** @unsafe Sets the content of this string - it may write out of bounds! */
    set content(value) {
      const offset = Il2Cpp3.string("vfsfitvnm").handle.offsetOf((_) => _.readInt() == 9) ?? raise("couldn't find the length offset in the native string struct");
      globalThis.Object.defineProperty(Il2Cpp3.String.prototype, "content", {
        set(value2) {
          Il2Cpp3.exports.stringGetChars(this).writeUtf16String(value2 ?? "");
          this.handle.add(offset).writeS32(value2?.length ?? 0);
        }
      });
      this.content = value;
    }
    /** Gets the length of this string. */
    get length() {
      return Il2Cpp3.exports.stringGetLength(this);
    }
    /** Gets the encompassing object of the current string. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `"${this.content}"`;
    }
  }
  Il2Cpp3.String = String2;
  function string(content) {
    return new Il2Cpp3.String(Il2Cpp3.exports.stringNew(Memory.allocUtf8String(content ?? "")));
  }
  Il2Cpp3.string = string;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Thread extends NativeStruct {
    /**
     * Gets the managed thread associated with the given native thread id (if any).
     *
     * This is an alternative to {@link Il2Cpp.attachedThreads}:
     * ```ts
     * async function findAllThreads() {
     *     const promises = Process.enumerateThreads().map(thread => Il2Cpp.Thread.fromId(thread.id));
     *     return (await Promise.all(promises)).filter(thread => thread != null);
     * }
     * ```
     */
    static fromId(threadId) {
      return Process.runOnThread(threadId, () => Il2Cpp3.currentThread);
    }
    /**
     * Gets the native (operative system) thread id of this thread, or a negative number if
     * it's not available.
     */
    get id() {
      let get = function() {
        return this.internal.field("thread_id").value.toNumber();
      };
      if (Process.platform != "windows") {
        const currentThreadId = Process.getCurrentThreadId();
        const currentPosixThread = ptr(get.apply(Il2Cpp3.currentThread));
        const offset = currentPosixThread.offsetOf((_) => _.readS32() == currentThreadId, 1024) ?? raise(`couldn't find the offset for determining the kernel id of a posix thread`);
        const getPosixThreadHandle = get;
        get = function() {
          const handle = ptr(getPosixThreadHandle.apply(this));
          if (handle.isNull()) {
            warn(`couldn't find thread id for ${this.handle}; returning a negative number, expect breakage`);
            return -1;
          }
          return handle.add(offset).readS32();
        };
      }
      getter(Il2Cpp3.Thread.prototype, "id", get, lazy);
      return this.id;
    }
    /**
     * Gets the internal managed thread (`System.Threading.InternalThread`) of this thread - actually a
     * [`MonoInternalThread`](https://github.com/mono/mono/blob/0f53e9e151d92944cacab3e24ac359410c606df6/mono/metadata/object-internals.h#L575).
     */
    get internal() {
      return this.object.tryField("internal_thread")?.value ?? // in older Unity versions, `System.Threading.Thread` already was a `MonoInternalThread`
      this.object;
    }
    /** Determines whether the current thread is the garbage collector finalizer one. */
    get isFinalizer() {
      return !Il2Cpp3.exports.threadIsVm(this);
    }
    /** Gets the managed id of the current thread. */
    get managedId() {
      return this.object.method("get_ManagedThreadId").invoke();
    }
    /** Gets the encompassing object of the current thread. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** @internal */
    get staticData() {
      return this.internal.field("static_data").value;
    }
    /** @internal */
    get synchronizationContext() {
      const get_ExecutionContext = this.object.tryMethod("GetMutableExecutionContext") ?? this.object.method("get_ExecutionContext");
      const executionContext = get_ExecutionContext.invoke();
      const synchronizationContext = executionContext.tryField("_syncContext")?.value ?? executionContext.tryMethod("get_SynchronizationContext")?.invoke() ?? this.tryLocalValue(Il2Cpp3.corlib.class("System.Threading.SynchronizationContext"));
      return synchronizationContext?.asNullable() ?? null;
    }
    /** Detaches the thread from the application domain. */
    detach() {
      return Il2Cpp3.exports.threadDetach(this);
    }
    /** Schedules a callback on the current thread. */
    schedule(block) {
      const Post = this.synchronizationContext?.tryMethod("Post");
      if (Post == null) {
        return Process.runOnThread(this.id, block);
      }
      return new Promise((resolve) => {
        const delegate = Il2Cpp3.delegate(Il2Cpp3.corlib.class("System.Threading.SendOrPostCallback"), () => {
          const result = block();
          setImmediate(() => resolve(result));
        });
        Script.bindWeak(globalThis, () => {
          delegate.field("method_ptr").value = delegate.field("invoke_impl").value = Il2Cpp3.exports.domainGet;
        });
        Post.invoke(delegate, NULL);
      });
    }
    /** @internal */
    tryLocalValue(klass) {
      for (let i = 0; i < 16; i++) {
        const base = this.staticData.add(i * Process.pointerSize).readPointer();
        if (!base.isNull()) {
          const object = new Il2Cpp3.Object(base.readPointer()).asNullable();
          if (object?.class?.isSubclassOf(klass, false)) {
            return object;
          }
        }
      }
    }
  }
  __decorate([
    lazy
  ], Thread.prototype, "internal", null);
  __decorate([
    lazy
  ], Thread.prototype, "isFinalizer", null);
  __decorate([
    lazy
  ], Thread.prototype, "managedId", null);
  __decorate([
    lazy
  ], Thread.prototype, "object", null);
  __decorate([
    lazy
  ], Thread.prototype, "staticData", null);
  __decorate([
    lazy
  ], Thread.prototype, "synchronizationContext", null);
  Il2Cpp3.Thread = Thread;
  getter(Il2Cpp3, "attachedThreads", () => {
    if (Il2Cpp3.exports.threadGetAttachedThreads.isNull()) {
      const currentThread = Il2Cpp3.currentThread ?? raise("current thread is not attached to IL2CPP");
      const pattern = currentThread.handle.toMatchPattern();
      const rangeProvider = function* () {
        try {
          yield* Il2Cpp3.gc.heapSections;
        } catch (_) {
        }
        yield Process.getRangeByAddress(Il2Cpp3.corlib.assembly.object);
        yield Process.getRangeByAddress(Il2Cpp3.corlib.class("System.Threading.Thread").staticFieldsData);
        yield* Process.enumerateRanges("rw-").filter((_) => _.file == void 0);
      };
      for (const range of rangeProvider()) {
        let matches = [];
        try {
          matches = Memory.scanSync(range.base, range.size, pattern);
        } catch (_) {
        }
        if (matches.length == 1) {
          const threads = [];
          const iter = (index) => {
            const handle = matches[0].address.add(index * Process.pointerSize).readPointer();
            if (!handle.isNull() && Process.findRangeByAddress(handle) != null) {
              const thread = new Il2Cpp3.Thread(handle);
              if (thread.object.class.equals(currentThread.object.class)) {
                return threads.push(thread);
              }
            }
          };
          for (let i = 0; iter(i); i--)
            ;
          threads.reverse();
          for (let i = 1; iter(i); i++)
            ;
          return threads;
        }
      }
      raise("couldn't collect attached threads");
    }
    return readNativeList(Il2Cpp3.exports.threadGetAttachedThreads).map((_) => new Il2Cpp3.Thread(_));
  });
  getter(Il2Cpp3, "currentThread", () => {
    return new Il2Cpp3.Thread(Il2Cpp3.exports.threadGetCurrent()).asNullable();
  });
  getter(Il2Cpp3, "mainThread", () => {
    return Il2Cpp3.attachedThreads[0];
  });
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Type = class Type extends NativeStruct {
    /** */
    static get Enum() {
      const _ = (_2, block = (_3) => _3) => block(Il2Cpp3.corlib.class(_2)).type.enumValue;
      const initial = {
        VOID: _("System.Void"),
        BOOLEAN: _("System.Boolean"),
        CHAR: _("System.Char"),
        BYTE: _("System.SByte"),
        UBYTE: _("System.Byte"),
        SHORT: _("System.Int16"),
        USHORT: _("System.UInt16"),
        INT: _("System.Int32"),
        UINT: _("System.UInt32"),
        LONG: _("System.Int64"),
        ULONG: _("System.UInt64"),
        NINT: _("System.IntPtr"),
        NUINT: _("System.UIntPtr"),
        FLOAT: _("System.Single"),
        DOUBLE: _("System.Double"),
        POINTER: _("System.IntPtr", (_2) => _2.field("m_value")),
        VALUE_TYPE: _("System.Decimal"),
        OBJECT: _("System.Object"),
        STRING: _("System.String"),
        CLASS: _("System.Array"),
        ARRAY: _("System.Void", (_2) => _2.arrayClass),
        NARRAY: _("System.Void", (_2) => new Il2Cpp3.Class(Il2Cpp3.exports.classGetArrayClass(_2, 2))),
        GENERIC_INSTANCE: _("System.Int32", (_2) => _2.interfaces.find((_3) => _3.name.endsWith("`1")))
      };
      Reflect.defineProperty(this, "Enum", { value: initial });
      return addFlippedEntries({
        ...initial,
        VAR: _("System.Action`1", (_2) => _2.generics[0]),
        MVAR: _("System.Array", (_2) => _2.method("AsReadOnly", 1).generics[0])
      });
    }
    /** Gets the class of this type. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.typeGetClass(this));
    }
    /** */
    get fridaAlias() {
      function getValueTypeFields(type) {
        const instanceFields = type.class.fields.filter((_) => !_.isStatic);
        return instanceFields.length == 0 ? ["char"] : instanceFields.map((_) => _.type.fridaAlias);
      }
      if (this.isByReference) {
        return "pointer";
      }
      switch (this.enumValue) {
        case Il2Cpp3.Type.Enum.VOID:
          return "void";
        case Il2Cpp3.Type.Enum.BOOLEAN:
          return "bool";
        case Il2Cpp3.Type.Enum.CHAR:
          return "uchar";
        case Il2Cpp3.Type.Enum.BYTE:
          return "int8";
        case Il2Cpp3.Type.Enum.UBYTE:
          return "uint8";
        case Il2Cpp3.Type.Enum.SHORT:
          return "int16";
        case Il2Cpp3.Type.Enum.USHORT:
          return "uint16";
        case Il2Cpp3.Type.Enum.INT:
          return "int32";
        case Il2Cpp3.Type.Enum.UINT:
          return "uint32";
        case Il2Cpp3.Type.Enum.LONG:
          return "int64";
        case Il2Cpp3.Type.Enum.ULONG:
          return "uint64";
        case Il2Cpp3.Type.Enum.FLOAT:
          return "float";
        case Il2Cpp3.Type.Enum.DOUBLE:
          return "double";
        case Il2Cpp3.Type.Enum.NINT:
        case Il2Cpp3.Type.Enum.NUINT:
        case Il2Cpp3.Type.Enum.POINTER:
        case Il2Cpp3.Type.Enum.STRING:
        case Il2Cpp3.Type.Enum.ARRAY:
        case Il2Cpp3.Type.Enum.NARRAY:
          return "pointer";
        case Il2Cpp3.Type.Enum.VALUE_TYPE:
          return this.class.isEnum ? this.class.baseType.fridaAlias : getValueTypeFields(this);
        case Il2Cpp3.Type.Enum.CLASS:
        case Il2Cpp3.Type.Enum.OBJECT:
        case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
          return this.class.isStruct ? getValueTypeFields(this) : this.class.isEnum ? this.class.baseType.fridaAlias : "pointer";
        default:
          return "pointer";
      }
    }
    /** Determines whether this type is passed by reference. */
    get isByReference() {
      return this.name.endsWith("&");
    }
    /** Determines whether this type is primitive. */
    get isPrimitive() {
      switch (this.enumValue) {
        case Il2Cpp3.Type.Enum.BOOLEAN:
        case Il2Cpp3.Type.Enum.CHAR:
        case Il2Cpp3.Type.Enum.BYTE:
        case Il2Cpp3.Type.Enum.UBYTE:
        case Il2Cpp3.Type.Enum.SHORT:
        case Il2Cpp3.Type.Enum.USHORT:
        case Il2Cpp3.Type.Enum.INT:
        case Il2Cpp3.Type.Enum.UINT:
        case Il2Cpp3.Type.Enum.LONG:
        case Il2Cpp3.Type.Enum.ULONG:
        case Il2Cpp3.Type.Enum.FLOAT:
        case Il2Cpp3.Type.Enum.DOUBLE:
        case Il2Cpp3.Type.Enum.NINT:
        case Il2Cpp3.Type.Enum.NUINT:
          return true;
        default:
          return false;
      }
    }
    /** Gets the name of this type. */
    get name() {
      const handle = Il2Cpp3.exports.typeGetName(this);
      try {
        return handle.readUtf8String();
      } finally {
        Il2Cpp3.free(handle);
      }
    }
    /** Gets the encompassing object of the current type. */
    get object() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.typeGetObject(this));
    }
    /** Gets the {@link Il2Cpp.Type.Enum} value of the current type. */
    get enumValue() {
      return Il2Cpp3.exports.typeGetTypeEnum(this);
    }
    is(other) {
      if (Il2Cpp3.exports.typeEquals.isNull()) {
        return this.object.method("Equals").invoke(other.object);
      }
      return !!Il2Cpp3.exports.typeEquals(this, other);
    }
    /** */
    toString() {
      return this.name;
    }
  };
  __decorate([
    lazy
  ], Type.prototype, "class", null);
  __decorate([
    lazy
  ], Type.prototype, "fridaAlias", null);
  __decorate([
    lazy
  ], Type.prototype, "isByReference", null);
  __decorate([
    lazy
  ], Type.prototype, "isPrimitive", null);
  __decorate([
    lazy
  ], Type.prototype, "name", null);
  __decorate([
    lazy
  ], Type.prototype, "object", null);
  __decorate([
    lazy
  ], Type.prototype, "enumValue", null);
  __decorate([
    lazy
  ], Type, "Enum", null);
  Type = __decorate([
    recycle
  ], Type);
  Il2Cpp3.Type = Type;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class ValueType extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Boxes the current value type in a object. */
    box() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.valueTypeBox(this.type.class, this));
    }
    /** Gets the non-static field with the given name of the current class hierarchy. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.type.name}`);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.type.name}`);
    }
    /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
    tryField(name) {
      const field = this.type.class.tryField(name);
      if (field?.isStatic) {
        for (const klass of this.type.class.hierarchy()) {
          for (const field2 of klass.fields) {
            if (field2.name == name && !field2.isStatic) {
              return field2.bind(this);
            }
          }
        }
        return void 0;
      }
      return field?.bind(this);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
    tryMethod(name, parameterCount = -1) {
      const method = this.type.class.tryMethod(name, parameterCount);
      if (method?.isStatic) {
        for (const klass of this.type.class.hierarchy()) {
          for (const method2 of klass.methods) {
            if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
              return method2.bind(this);
            }
          }
        }
        return void 0;
      }
      return method?.bind(this);
    }
    /** */
    toString() {
      const ToString = this.method("ToString", 0);
      return this.isNull() ? "null" : (
        // If ToString is defined within a value type class, we can
        // avoid a boxing operation.
        ToString.class.isValueType ? ToString.invoke().content ?? "null" : this.box().toString() ?? "null"
      );
    }
  }
  Il2Cpp3.ValueType = ValueType;
})(Il2Cpp2 || (Il2Cpp2 = {}));
globalThis.Il2Cpp = Il2Cpp2;


// hook.ts
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const CONFIG_LOCAL = "http://localhost:3000/config.json";
const CONFIG_URL = "https://tesl-reborn.com/config.json";
const PLUGIN_VERSION = "1.3.1-beta";
const COMPONENT_TYPE = "win";
const LOGIN_PLATFORM = "Steam";
const MAJOR_VERSION = "db-630167952";
const CHANGELIST = "317259";
const TAG = "[tesl-hook]";
let androidLogWrite = null;
try {
  androidLogWrite = new NativeFunction(
    Process.getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int",
    ["int", "pointer", "pointer"]
  );
} catch (e) {
  console.log(`${TAG} no liblog: ${e}`);
}
const tagPtr = Memory.allocUtf8String("tesl-hook");
function redactLog(message) {
  return String(message).replace(/("(?:password|encryptedAppTicket|token|sessionToken|access_token|refresh_token|authorization|x-session-token)"\s*:\s*")(?:[^"\\]|\\[\s\S])*(?:"|\\?$)/gi, '$1[REDACTED]"').replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]").replace(/((?:authorization|x-session-token)\s*:\s*)[^\r\n]*/gi, "$1[REDACTED]").replace(/\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){0,2}/g, "[REDACTED-JWT]");
}
let portLog = null;
try {
  portLog = createNativePortLog(redactLog);
} catch (_) {
}
const log = (m) => {
  m = redactLog(m);
  portLog?.(m);
  console.log(`${TAG} ${m}`);
  try {
    androidLogWrite?.(4, tagPtr, Memory.allocUtf8String(m.length > 900 ? m.slice(0, 900) + "..." : m));
  } catch (_) {
  }
};
let nativeRename = null;
function atomicRename(from, to) {
  try {
    if (!nativeRename) nativeRename = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("rename"), "int", ["pointer", "pointer"]);
    return nativeRename(Memory.allocUtf8String(from), Memory.allocUtf8String(to)) === 0;
  } catch (_) {
    return false;
  }
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fakeTicket(len = 32) {
  const b = [];
  for (let i = 0; i < len; i++) b.push(Math.floor(Math.random() * 256));
  let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = b[i] << 16 | (b[i + 1] ?? 0) << 8 | (b[i + 2] ?? 0);
    o += B64[n >> 18 & 63] + B64[n >> 12 & 63];
    o += i + 1 < b.length ? B64[n >> 6 & 63] : "=";
    o += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return o;
}
function invokeDelegateInt(del, value) {
  const method = del.method("Invoke"), klass = method.parameters[0].type.class;
  if (klass.isEnum) {
    const boxed = klass.alloc();
    boxed.field("value__").value = value;
    method.invoke(boxed.unbox());
  } else method.invoke(value);
}
function nested(image, outer, inner) {
  const c = image.classes.find((k) => k.name === inner && k.declaringClass?.name === outer);
  if (!c) throw new Error(`class ${outer}/${inner} not found`);
  return c;
}
function enumVal(v) {
  if (v == null) return -1;
  if (typeof v === "number") return v;
  try {
    return Number(v.field("value__").value);
  } catch (_) {
    return -1;
  }
}
function channelFrom(settings) {
  try {
    if (settings && !settings.handle.isNull()) {
      const names = settings.field("_channelNames").value;
      const idx = enumVal(settings.field("_channel").value);
      return names.get(idx).content ?? "live";
    }
  } catch (e) {
    log(`channel lookup failed: ${e}`);
  }
  return "live";
}
function fillBase(req, channel) {
  req.field("channel").value = Il2Cpp.string(channel);
  req.field("majorVersion").value = Il2Cpp.string(MAJOR_VERSION);
  req.field("changelist").value = Il2Cpp.string(CHANGELIST);
  req.field("componentType").value = Il2Cpp.string(COMPONENT_TYPE);
}
function call(o, name, ...a) {
  return o.method(name).invoke(...a);
}
function bodyOf(req) {
  try {
    const raw = call(req, "get_RawData");
    if (!raw || raw.handle.isNull()) return "(none)";
    const n = Math.min(Number(raw.length), 1500);
    let t = "";
    for (let i = 0; i < n; i++) t += String.fromCharCode(Number(raw.get(i)));
    return redactLog(t);
  } catch (e) {
    return `(unreadable: ${e})`;
  }
}
const OVERRIDES_PATH = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-hook.json";
function loadOverrides() {
  const o = {
    componentType: COMPONENT_TYPE,
    majorVersion: MAJOR_VERSION,
    changelist: CHANGELIST,
    channel: "prod-live",
    os: "WINDOWS",
    platform: "PC_CLIENT",
    osVersion: "10"
  };
  try {
    const extra = JSON.parse(File.readAllText(OVERRIDES_PATH));
    for (const k of Object.keys(extra)) o[k] = String(extra[k]);
    log(`overrides loaded from ${OVERRIDES_PATH}`);
  } catch (_) {
    log("no tesl-hook.json, using default overrides");
  }
  return o;
}
let currentSection = "startup";
const hookTimer = (() => {
  try {
    const spent = /* @__PURE__ */ new Map();
    const now = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("clock_gettime"), "int", ["int", "pointer"]);
    const buffer = Memory.alloc(16);
    const micros = () => {
      now(1, buffer);
      return buffer.readS64().toNumber() * 1e6 + buffer.add(8).readS64().toNumber() / 1e3;
    };
    let reportAt = Date.now() + 15e3, since = Date.now();
    const record = (name, us) => {
      const entry = spent.get(name) || { us: 0, calls: 0 };
      entry.us += us;
      entry.calls++;
      spent.set(name, entry);
      if (Date.now() < reportAt) return;
      const seconds = (Date.now() - since) / 1e3;
      const top = Array.from(spent.entries()).sort((a, b) => b[1].us - a[1].us).slice(0, 8).map(([key, value]) => `${key} ${(value.us / seconds / 1e3).toFixed(1)} ms/s ${Math.round(value.calls / seconds)}/s`);
      let total = 0;
      spent.forEach((value) => {
        total += value.us;
      });
      log(`hook cost: ${(total / seconds / 1e3).toFixed(1)} ms/s; ${top.join("; ")}`);
      spent.clear();
      since = Date.now();
      reportAt = since + 15e3;
    };
    micros();
    return (name, fn) => function(...args) {
      const start = micros();
      try {
        return fn.apply(this, args);
      } finally {
        try {
          record(name, micros() - start);
        } catch (_) {
        }
      }
    };
  } catch (_) {
    return null;
  }
})();
function hookAttach(target, callbacks) {
  if (!hookTimer || typeof callbacks !== "object" || callbacks === null) return Interceptor.attach(target, callbacks);
  const name = currentSection, wrapped = {};
  if (callbacks.onEnter) wrapped.onEnter = hookTimer(name, callbacks.onEnter);
  if (callbacks.onLeave) wrapped.onLeave = hookTimer(name, callbacks.onLeave);
  return Interceptor.attach(target, wrapped);
}
function section(name, fn) {
  currentSection = name;
  try {
    fn();
    log(`OK   ${name}`);
  } catch (e) {
    log(`FAIL ${name}: ${e}`);
  } finally {
    currentSection = "later";
  }
}
function cls(img, full) {
  const c = img.tryClass(full);
  if (c) return c;
  const short = full.split(".").pop();
  const alt = img.classes.find((k) => k.name === short && k.declaringClass == null);
  if (!alt) throw new Error(`class ${full} not found`);
  return alt;
}
function invokeDelegatePtr(del, value) {
  const method = del.method("Invoke"), handle = value?.handle ?? value;
  const argument = method.parameters[0].type.name === "System.String" ? new Il2Cpp.String(handle) : new Il2Cpp.Object(handle);
  method.invoke(argument);
}
const CREATE_ACCOUNT = false;
Il2Cpp.perform(() => {
  const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  const resourceTrace = [], resourceTraceStarted = Date.now();
  function recordResourceEvent(kind, path, status = 0) {
    if (Date.now() - resourceTraceStarted > 9e5) return;
    resourceTrace.push({ at: Date.now(), kind, path: String(path).replace(/[?#].*$/, "").slice(0, 240), status });
    if (resourceTrace.length > 128) resourceTrace.shift();
  }
  log(`attached, Unity ${Il2Cpp.unityVersion}, Android patch ${globalThis.TeslRebornUpdater?.current()?.revision ?? "embedded"}`);
  const utils = cls(img, "SparkleServices.HTTPUtils");
  const authResult = nested(img, "AuthBase", "AuthResult");
  const steamReq = nested(img, "AuthBase", "AuthBNETSteamRequest");
  const linkReq = nested(img, "AuthBase", "SteamSessionLinkRequest");
  const postGeneric = utils.methods.find((m) => m.name === "Post" && m.isGeneric && m.generics.length === 2);
  const postLogin = postGeneric.inflate(steamReq, authResult);
  const postLink = postGeneric.inflate(linkReq, authResult);
  function sendLogin(language, settings, endpoint, cb) {
    const body = steamReq.new();
    fillBase(body, channelFrom(settings));
    body.field("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("createAccount").value = CREATE_ACCOUNT;
    body.field("language").value = resourceLanguage() ? Il2Cpp.string(shapedLanguage(resourceLanguage(), language.content || "en")) : language;
    body.field("steamId").value = Il2Cpp.string("");
    body.field("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLogin.invoke(body, endpoint, Il2Cpp.string("bnetSteamLogin"), NULL, cb);
  }
  function sendLink(sessionAuth, language, settings, endpoint, cb) {
    const body = linkReq.new();
    fillBase(body, channelFrom(settings));
    body.field("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("language").value = resourceLanguage() ? Il2Cpp.string(shapedLanguage(resourceLanguage(), language.content || "en")) : language;
    body.field("steamId").value = Il2Cpp.string("");
    body.field("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLink.invoke(
      body,
      endpoint,
      Il2Cpp.string("bnetSteamLinkToSession"),
      sessionAuth.field("token").value,
      cb
    );
  }
  section("auth hooks (BNETPlatformAuthInstance)", () => {
    const bnet = cls(img, "SparkleServices.BNETPlatformAuthInstance");
    bnet.method("SignIn").implementation = function(_request, cb) {
      log("Bypassing BNET SignIn");
      invokeDelegateInt(cb, 0);
    };
    bnet.method("DoNsoAuth").implementation = function(_createAnon, request, cb) {
      log("Bypassing NSO Auth");
      const req = request;
      sendLogin(
        req.field("LanguageCode").value,
        req.field("ServicesSettings").value,
        req.field("AccountEndPoint").value,
        cb
      );
    };
    bnet.method("DoNsoToSessionLink").implementation = function(sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Bypassing NSO To Session Link");
      sendLink(
        sessionAuth,
        language,
        settings,
        endpoint,
        cb
      );
    };
  });
  section("auth hooks (GooglePlayAuthUtilities)", () => {
    const gp = cls(img, "SparkleServices.GooglePlayAuthUtilities");
    gp.method("SignOn").implementation = function(cb) {
      log("Bypassing Google Play SignOn");
      invokeDelegateInt(cb, 0);
    };
    gp.method("RequestGooglePlayServerAuthCode").implementation = function(cb) {
      log("Bypassing Google Play server auth code");
      invokeDelegatePtr(cb, Il2Cpp.string("").handle);
    };
    gp.method("DoAuth").implementation = function(_createAnon, language, _dev, settings, endpoint, cb) {
      log("Google Play DoAuth -> Steam-style login");
      sendLogin(language, settings, endpoint, cb);
    };
    gp.method("LinkToSession").implementation = function(sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Google Play LinkToSession -> Steam-style link");
      sendLink(
        sessionAuth,
        language,
        settings,
        endpoint,
        cb
      );
    };
  });
  const overrides = loadOverrides();
  const byteClass = Il2Cpp.corlib.class("System.Byte");
  function pinRequestLanguage(req) {
    let uri = String(call(req, "get_Uri"));
    const chosen = resourceLanguage(), next = localizedGameUri(uri, chosen);
    if (next !== uri) {
      const value = newWith(ucls("System.Uri"), Il2Cpp.string(next));
      try {
        call(req, "set_Uri", value);
      } catch (_) {
        req.field("<Uri>k__BackingField").value = value;
      }
      uri = next;
    }
    return uri;
  }
  section("request language before send", () => {
    const send = cls(img, "BestHTTP.HTTPRequest").tryMethod("Send", 0);
    if (send && !send.virtualAddress.isNull()) hookAttach(send.virtualAddress, {
      onEnter(args) {
        try {
          pinRequestLanguage(new Il2Cpp.Object(args[0]));
        } catch (error) {
          log(`request language: ${error}`);
        }
      }
    });
  });
  function rewriteAuthBody(req, uri) {
    try {
      if (uri.indexOf("/api/account/") < 0) return;
      const raw = call(req, "get_RawData");
      if (!raw || raw.handle.isNull()) {
        log(`normalizer: ${uri.split("/").pop()} has no body`);
        return;
      }
      const len = Number(raw.length);
      let bin = "";
      for (let i = 0; i < len; i++) bin += String.fromCharCode(Number(raw.get(i)));
      const obj = JSON.parse(decodeURIComponent(Array.from(bin, (ch) => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
      if (typeof obj !== "object" || obj === null || !("componentType" in obj)) {
        log(`normalizer: ${uri.split("/").pop()} has no componentType`);
        return;
      }
      const changed = [];
      const language = resourceLanguage();
      if (language && typeof obj.language === "string") {
        const selected = shapedLanguage(language, obj.language);
        if (obj.language !== selected) {
          obj.language = selected;
          changed.push("language");
        }
      }
      for (const k of Object.keys(overrides)) {
        if (k in obj && obj[k] !== overrides[k]) {
          obj[k] = overrides[k];
          changed.push(k);
        }
      }
      if (uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
        obj.fingerprint = freshFingerprint();
        if (changed.indexOf("fingerprint") < 0) changed.push("fingerprint");
      }
      if (changed.length === 0) {
        log(`normalizer: ${uri.split("/").pop()} needs no change`);
        return;
      }
      const out = encodeURIComponent(JSON.stringify(obj)).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const arr = Il2Cpp.array(byteClass, out.length);
      for (let i = 0; i < out.length; i++) arr.set(i, out.charCodeAt(i));
      call(req, "set_RawData", arr);
      log(`rewrote ${uri.split("/").pop()}: ${changed.join(",")}`);
    } catch (e) {
      log(`normalizer error: ${e}`);
    }
  }
  let pendingLogin = null;
  function captureLogin(req, uri) {
    try {
      if (uri.indexOf("bnetUsernameAndPasswordLogin") < 0) return;
      const raw = call(req, "get_RawData");
      if (!raw || raw.handle.isNull()) return;
      const length = Number(raw.length);
      if (length > 65536) {
        log("login request exceeds capture limit");
        return;
      }
      let text = "";
      for (let i = 0; i < length; i++) text += "%" + Number(raw.get(i)).toString(16).padStart(2, "0");
      const body = JSON.parse(decodeURIComponent(text));
      if (body && body.username) pendingLogin = { username: String(body.username), password: String(body.password ?? "") };
    } catch (e) {
      log("could not read login credentials from request body");
    }
  }
  section("config redirect", () => {
    hookAttach(cls(img, "SparkleServices.FetchConfig").method("StartProcess").virtualAddress, {
      onEnter(args) {
        args[1] = Il2Cpp.string(CONFIG_LOCAL).handle;
        args[2] = Il2Cpp.string(CONFIG_URL).handle;
        args[3] = ptr(1);
        log("FetchConfig.StartProcess redirected");
      }
    });
  });
  section("http caching", () => {
    hookAttach(cls(img, "BestHTTP.HTTPManager").method("get_IsCachingDisabled").virtualAddress, {
      onLeave(ret) {
        ret.replace(ptr(0));
      }
    });
  });
  section("http header", () => {
    let seen = 0;
    const m = cls(img, "BestHTTP.HTTPRequest").method("EnumerateHeaders", 2);
    hookAttach(m.virtualAddress, {
      onEnter(args) {
        try {
          const req = new Il2Cpp.Object(args[0]);
          let hasVersion = false;
          try {
            hasVersion = Boolean(call(req, "HasHeader", Il2Cpp.string("X-TeslRebornPlugin-Version")));
          } catch (_) {
          }
          if (!hasVersion) req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
          const uri = pinRequestLanguage(req);
          captureLogin(req, uri);
          rewriteAuthBody(req, uri);
          if (seen++ < 60) log(`-> ${diagnosticUri(uri)} body: ${bodyOf(req)}`);
        } catch (e) {
          log(`header hook error: ${e}`);
        }
      }
    });
  });
  function loginOutcome(status, body) {
    if (status !== 200) return "unknown";
    try {
      const json = JSON.parse(body), code = json?.resultCode;
      const token = json?.data?.token ?? json?.token;
      if (typeof token === "string" && token.length > 0 && (code === 0 || code == null)) return "success";
      if (code === 15 || code === 17) return "rejected";
    } catch (_) {
    }
    return "unknown";
  }
  function diagnosticUri(uri) {
    return String(uri).replace(/[?#].*$/, "");
  }
  function reportHttpResult(req, ordinaryBudget) {
    const uri = String(call(req, "get_Uri"));
    const state = String(call(req, "get_State"));
    const response = call(req, "get_Response");
    let status = 0, info = "no response";
    if (!isNull(response)) {
      status = Number(call(response, "get_StatusCode"));
      info = `status ${status}`;
    } else {
      try {
        const exception = call(req, "get_Exception");
        if (!isNull(exception)) info = `exception: ${String(exception)}`;
      } catch (_) {
      }
    }
    if (ordinaryBudget || status === 0 || status >= 400 || /\/api\/account\//.test(uri))
      log(`<- ${state} ${diagnosticUri(uri)} ${info}`);
    if (typeof recordResourceEvent === "function") recordResourceEvent("http-" + state, diagnosticUri(uri), status);
    if (pendingLogin && uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
      let body = "";
      try {
        body = String(call(response, "get_DataAsText")?.content ?? "");
      } catch (_) {
      }
      const outcome = loginOutcome(status, body);
      if (outcome === "success") writeSavedLogin(pendingLogin.username, pendingLogin.password);
      else if (outcome === "rejected") {
        const saved = readSavedLogin();
        if (!saved?.password) writeSavedLogin(pendingLogin.username, "");
        log("login: refused; previous successful credentials retained");
      } else log(`login: HTTP ${status}; saved credentials unchanged`);
      pendingLogin = null;
    }
  }
  section("http trace", () => {
    let seen = 0;
    hookAttach(cls(img, "BestHTTP.HTTPRequest").method("CallCallback").virtualAddress, {
      onEnter(args) {
        try {
          reportHttpResult(new Il2Cpp.Object(args[0]), seen++ < 80);
        } catch (error) {
          log(`trace error: ${error}`);
        }
      }
    });
  });
  const strOf = (p) => {
    try {
      return p.isNull() ? "" : String(new Il2Cpp.String(p).content ?? "");
    } catch (_) {
      return "?";
    }
  };
  const msgOf = (p) => {
    try {
      return p.isNull() ? "" : String(call(new Il2Cpp.Object(p), "get_Message"));
    } catch (_) {
      return "?";
    }
  };
  const byName = (full, suffix, minParams = 0) => {
    const k = cls(img, full);
    const m = k.methods.find((x) => x.name.endsWith(suffix) && x.parameterCount >= minParams);
    if (!m) throw new Error(`${full}::${suffix} not found`);
    return m;
  };
  section("error tracing: ErrorHandler.OnError", () => {
    hookAttach(byName("ErrorHandler", "OnError", 4).virtualAddress, {
      onEnter(args) {
        log(`ErrorHandler.OnError code=${args[1].toInt32()} endpoint=${strOf(args[2])}`);
      }
    });
  });
  section("error tracing: websocket transport", () => {
    const wt = "BestHTTP.SocketIO.Transports.WebSocketTransport";
    hookAttach(byName(wt, "OnOpen").virtualAddress, { onEnter() {
      log("ws transport: open");
    } });
    hookAttach(byName(wt, "OnError").virtualAddress, { onEnter(args) {
      log(`ws transport: ERROR ${msgOf(args[2])}`);
    } });
    hookAttach(byName(wt, "OnClosed").virtualAddress, {
      onEnter(args) {
        log(`ws transport: closed code=${args[2].toInt32() & 65535} msg=${strOf(args[3])}`);
      }
    });
  });
  section("error tracing: socket.io manager", () => {
    const sm = "BestHTTP.SocketIO.SocketManager";
    hookAttach(byName(sm, "OnTransportConnected").virtualAddress, { onEnter() {
      log("socket.io: transport connected");
    } });
    hookAttach(byName(sm, "OnTransportError").virtualAddress, { onEnter(args) {
      log(`socket.io: transport error ${strOf(args[2])}`);
    } });
    hookAttach(byName(sm, "EmitError").virtualAddress, { onEnter(args) {
      log(`socket.io: EmitError code=${args[1].toInt32()} msg=${strOf(args[2])}`);
    } });
  });
  const rawStr = (q) => {
    try {
      if (q.isNull()) return "(null)";
      const n = q.add(16).readS32();
      return n >= 0 && n < 512 ? q.add(20).readUtf16String(n) ?? "" : `(bad length ${n})`;
    } catch (_) {
      return "(unreadable)";
    }
  };
  section("bundles: desktop behaviour", () => {
    let inLoad = false;
    hookAttach(byName("AssetBundles.AssetBundleManager", "LoadAssetBundleInternal").virtualAddress, {
      onEnter() {
        inLoad = true;
      },
      onLeave() {
        inLoad = false;
      }
    });
    let once = 0;
    hookAttach(byName("PlatformUtils", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) {
        if (inLoad) {
          ret.replace(ptr(0));
          if (once++ < 3) log("PlatformUtils.PlatformDownloadsBundles -> false (manifest from OBB)");
        }
      }
    });
    let once2 = 0;
    hookAttach(byName("AssetCatalog", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) {
        ret.replace(ptr(0));
        if (once2++ < 3) log("AssetCatalog.PlatformDownloadsBundles -> false (no CDN download)");
      }
    });
    try {
      let seenLocal = 0;
      const mgr = cls(img, "AssetBundles.AssetBundleManager");
      hookAttach(mgr.method("SetSourceAssetBundleURL").virtualAddress, {
        onEnter(args) {
          log(`AssetBundleManager.SetSourceAssetBundleURL("${rawStr(args[1])}")`);
        }
      });
      const local = cls(img, "AssetBundles.AssetBundleLoadFromLocalOperation");
      hookAttach(local.method(".ctor", 1).virtualAddress, {
        onEnter(args) {
          if (seenLocal++ < 4) log(`AssetBundleLoadFromLocalOperation("${rawStr(args[1])}")`);
        }
      });
    } catch (e) {
      log(`obb trace failed: ${e}`);
    }
  });
  section("storage modes from local versions.json", () => {
    const catalog = cls(img, "AssetCatalog");
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const init = mgr.methods.find((x) => x.name === "Initialize");
    if (!init) throw new Error("AssetBundleManager.Initialize not found");
    const className = (o) => {
      try {
        return isNull(o) ? "(null)" : o.class.name;
      } catch (_) {
        return "(?)";
      }
    };
    hookAttach(init.virtualAddress, {
      onEnter(args) {
        try {
          let versionInfo = null;
          for (const arg of [args[0], args[1], args[2]]) {
            if (className(arg) === "BundleVersionInfo") {
              versionInfo = new Il2Cpp.Object(arg);
              break;
            }
          }
          if (!versionInfo) {
            const remote = catalog.field("_remoteBundleVersionInfo").value;
            if (className(remote) === "BundleVersionInfo") versionInfo = remote;
          }
          if (!versionInfo) {
            log(`storage modes: no version info found (args: ${className(args[0])}, ${className(args[1])})`);
            return;
          }
          const count = () => Number(call(versionInfo.field("_entries").value, "get_Count"));
          const before = count();
          if (before === 0) {
            const path = String(catalog.method("GetVersionJsonPath").invoke()?.content ?? "");
            log(`storage modes: loading ${path}`);
            call(versionInfo, "Load", Il2Cpp.string(path));
            if (count() === 0) {
              try {
                const fileClass = Il2Cpp.corlib.class("System.IO.File");
                const exists = fileClass.method("Exists").invoke(Il2Cpp.string(path));
                if (Boolean(exists)) {
                  const text = String(fileClass.method("ReadAllText").invoke(Il2Cpp.string(path))?.content ?? "");
                  if (text.length > 0) {
                    versionInfo.method("LoadFromMemory").invoke(Il2Cpp.string(text));
                    log(`storage modes: LoadFromMemory added ${count()} entries (path failed)`);
                  }
                }
              } catch (e) {
                log(`storage modes: recovery failed: ${e}`);
              }
            }
          }
          log(`AssetBundleManager.Initialize: version info entries ${before} -> ${count()}`);
        } catch (e) {
          log(`storage mode fill error: ${e}`);
        }
      }
    });
  });
  section("versions.json load", () => {
    const m = cls(img, "BundleVersionInfo").methods.find((x) => x.name === "Load");
    if (!m) throw new Error("BundleVersionInfo.Load not found");
    let path = "";
    hookAttach(m.virtualAddress, {
      onEnter(args) {
        path = rawStr(args[1]);
      },
      // instance: args[0] = this, args[1] = path
      onLeave(ret) {
        log(`BundleVersionInfo.Load("${path}") -> ${ret.toInt32() & 255 ? "ok" : "FAILED"}`);
      }
    });
  });
  section("cache never expires", () => {
    const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    const cache = core.class("UnityEngine.Cache");
    const caching = core.class("UnityEngine.Caching");
    const MAX_DELAY = 1296e4;
    const setDelay = cache.method("Cache_SetExpirationDelay", 2);
    hookAttach(setDelay.virtualAddress, {
      onEnter(args) {
        const delay = args[2].toInt32();
        if (delay < MAX_DELAY) {
          log(`Cache.expirationDelay ${delay} -> ${MAX_DELAY}`);
          args[2] = ptr(MAX_DELAY);
        }
      }
    });
    let cleared = 0;
    hookAttach(caching.method("ClearCachedVersion", 2).virtualAddress, {
      onEnter() {
        if (cleared++ < 5) log("Caching.ClearCachedVersion -> ignored");
      },
      onLeave(ret) {
        ret.replace(ptr(1));
      }
    });
  });
  const NEWS_URL = "https://tesl-reborn.com/news.json";
  const ENDPOINT_INVENTORY = 6;
  const ENDPOINT_STATS = 11;
  const RARITY_LEGENDARY = 3;
  const CREDIT_GROUP = 1, CREDIT_TITLE = 2, CREDIT_NAME = 3;
  const TRANSLATIONS = {
    en: {
      "reborn.titles.keeper.description": "Awarded to Alpha testers of TESL Reborn.",
      "reborn.titles.keeper.title": "The Keeper of TESL Reborn",
      "reborn.titles.founder.title": "The Founder of TESL Reborn",
      "reborn.titles.founder.description": "Awarded to developers of TESL Reborn.",
      "reborn.chat.doinker.description": "Use Ctrl + Mouse Wheel or Ctrl + +/- to adjust chat font size. Your preference will be saved for future sessions."
    },
    de: {
      "reborn.titles.keeper.description": "Verliehen an Alpha-Tester von TESL Reborn.",
      "reborn.titles.keeper.title": "Der H\xFCter von TESL Reborn",
      "reborn.titles.founder.title": "Der Gr\xFCnder von TESL Reborn",
      "reborn.titles.founder.description": "Verliehen an Entwickler von TESL Reborn."
    },
    es: {
      "reborn.titles.keeper.description": "Otorgado a los testers alfa de TESL Reborn.",
      "reborn.titles.keeper.title": "El Guardi\xE1n de TESL Reborn",
      "reborn.titles.founder.title": "El Fundador de TESL Reborn",
      "reborn.titles.founder.description": "Otorgado a los desarrolladores de TESL Reborn."
    },
    fr: {
      "reborn.titles.keeper.description": "D\xE9cern\xE9 aux testeurs alpha de TESL Reborn.",
      "reborn.titles.keeper.title": "Le Gardien de TESL Reborn",
      "reborn.titles.founder.title": "Le Fondateur de TESL Reborn",
      "reborn.titles.founder.description": "D\xE9cern\xE9 aux d\xE9veloppeurs de TESL Reborn."
    },
    it: {
      "reborn.titles.keeper.description": "Assegnato ai tester alpha di TESL Reborn.",
      "reborn.titles.keeper.title": "Il Custode di TESL Reborn",
      "reborn.titles.founder.title": "Il Fondatore di TESL Reborn",
      "reborn.titles.founder.description": "Assegnato agli sviluppatori di TESL Reborn."
    },
    pl: {
      "reborn.titles.keeper.description": "Przyznane testerom alpha TESL Reborn.",
      "reborn.titles.keeper.title": "Stra\u017Cnik TESL Reborn",
      "reborn.titles.founder.title": "Za\u0142o\u017Cyciel TESL Reborn",
      "reborn.titles.founder.description": "Przyznane tw\xF3rcom TESL Reborn."
    },
    pt: {
      "reborn.titles.keeper.description": "Concedido aos testadores alpha do TESL Reborn.",
      "reborn.titles.keeper.title": "O Guardi\xE3o do TESL Reborn",
      "reborn.titles.founder.title": "O Fundador do TESL Reborn",
      "reborn.titles.founder.description": "Concedido aos desenvolvedores do TESL Reborn."
    },
    ru: {
      "reborn.titles.keeper.description": "\u0412\u0440\u0443\u0447\u0430\u0435\u0442\u0441\u044F \u0430\u043B\u044C\u0444\u0430-\u0442\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0449\u0438\u043A\u0430\u043C TESL Reborn.",
      "reborn.titles.keeper.title": "\u0425\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u044C TESL Reborn",
      "reborn.titles.founder.title": "\u041E\u0441\u043D\u043E\u0432\u0430\u0442\u0435\u043B\u044C TESL Reborn",
      "reborn.titles.founder.description": "\u0412\u0440\u0443\u0447\u0430\u0435\u0442\u0441\u044F \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0447\u0438\u043A\u0430\u043C TESL Reborn."
    },
    tr: {
      "reborn.titles.keeper.description": "TESL Reborn alfa test\xE7ilerine verilmi\u015Ftir.",
      "reborn.titles.keeper.title": "TESL Reborn'\u0131n Bek\xE7isi",
      "reborn.titles.founder.title": "TESL Reborn'\u0131n Kurucusu",
      "reborn.titles.founder.description": "TESL Reborn geli\u015Ftiricilerine verilmi\u015Ftir."
    }
  };
  function persistentPath() {
    try {
      const path = ucls("UnityEngine.Application").method("get_persistentDataPath").invoke();
      return String(path?.content ?? "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files");
    } catch (e) {
      return "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files";
    }
  }
  function readTextFile(path) {
    try {
      const file = Il2Cpp.corlib.class("System.IO.File");
      if (!Boolean(file.method("Exists").invoke(Il2Cpp.string(path)))) return "";
      return String(file.method("ReadAllText").invoke(Il2Cpp.string(path))?.content ?? "");
    } catch (e) {
      return "";
    }
  }
  function writeTextFile(path, text) {
    try {
      Il2Cpp.corlib.class("System.IO.File").method("WriteAllText").invoke(Il2Cpp.string(path), Il2Cpp.string(text));
      return true;
    } catch (e) {
      return false;
    }
  }
  function freshFingerprint() {
    let hex = "";
    for (let i = 0; i < 16; i++) hex += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
    return hex;
  }
  function newWith(klass, ...args) {
    const o = klass.alloc(), root = o.ref(false);
    try {
      o.method(".ctor", args.length).invoke(...args);
      return o;
    } finally {
      root.free();
    }
  }
  function isNull(o) {
    return !o || !o.handle || o.handle.isNull();
  }
  let unityEquality = null;
  function unityAlive(o) {
    if (isNull(o)) return false;
    try {
      if (!unityEquality) unityEquality = ucls("UnityEngine.Object").method("op_Equality");
      return !unityEquality.invoke(o, NULL);
    } catch (_) {
      return false;
    }
  }
  const classCache = {};
  let allImages = null;
  function ucls(name) {
    const cached = classCache[name];
    if (cached) return cached;
    if (!allImages) allImages = Il2Cpp.domain.assemblies.map((a) => a.image);
    const image = allImages.find((i) => i.tryClass(name) != null);
    if (!image) throw new Error(`class ${name} not found in any assembly`);
    const found = image.tryClass(name);
    classCache[name] = found;
    return found;
  }
  function unityStruct(name, fields) {
    const boxed = ucls(name).alloc();
    for (const key of Object.keys(fields)) boxed.field(key).value = fields[key];
    return boxed.unbox();
  }
  function vec2(x, y) {
    return unityStruct("UnityEngine.Vector2", { x, y });
  }
  function rgba(r, g, b, a) {
    return unityStruct("UnityEngine.Color", { r, g, b, a });
  }
  function enumBox(enumClass, n) {
    const boxed = enumClass.alloc();
    boxed.field("value__").value = n;
    return boxed.unbox();
  }
  function endpointUrl(kind) {
    try {
      const sm = cls(img, "SparkleServices.ServicesManager").method("get_Instance").invoke();
      if (isNull(sm)) return "";
      const eps = call(sm, "get_Endpoints");
      if (isNull(eps)) return "";
      return String(call(eps, "Get", kind)?.content ?? "");
    } catch (e) {
      return "";
    }
  }
  function authToken() {
    try {
      const sm = cls(img, "SparkleServices.ServicesManager").method("get_Instance").invoke();
      if (isNull(sm)) return "";
      const data = call(sm, "get_AuthData");
      if (isNull(data)) return "";
      return String(data.field("token").value?.content ?? "");
    } catch (e) {
      return "";
    }
  }
  function httpGet(url, withAuth, cb, updateRequest = false) {
    schedule(0, () => {
      let stage = "URI constructor";
      try {
        const uri = ucls("System.Uri").alloc();
        uri.method(".ctor").overload("System.String").invoke(Il2Cpp.string(url));
        stage = "callback delegate";
        const del = Il2Cpp.delegate(cls(img, "BestHTTP.OnRequestFinishedDelegate"), (req2, resp) => {
          try {
            if (isNull(resp)) {
              let detail = "response is null";
              try {
                detail += `, state=${call(req2, "get_State")}, exception=${call(req2, "get_Exception")}`;
              } catch (_) {
              }
              log(`GET ${url} failed: ${detail}`);
              cb(-1, detail);
              return;
            }
            const status = Number(call(resp, "get_StatusCode"));
            let body = "";
            try {
              body = String(call(resp, "get_DataAsText")?.content ?? "");
            } catch (_) {
            }
            log(`GET ${url} completed: HTTP ${status}`);
            const cachedBody = status === 304 && body.trim().length > 0;
            if (cachedBody) log(`GET ${url}: cached response body accepted`);
            cb(cachedBody ? 200 : status, body);
          } catch (e) {
            log(`GET ${url} callback failed: ${e}`);
            cb(-1, String(e));
          }
        });
        stage = "HTTPRequest(Uri, OnRequestFinishedDelegate) constructor";
        const req = cls(img, "BestHTTP.HTTPRequest").alloc();
        req.method(".ctor").overload("System.Uri", "BestHTTP.OnRequestFinishedDelegate").invoke(uri, del);
        stage = "update request constraints";
        if (updateRequest) {
          req.method("set_MaxRedirects").invoke(0);
        }
        stage = "headers";
        req.method("AddHeader").invoke(Il2Cpp.string("Accept"), Il2Cpp.string("application/json"));
        req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
        if (withAuth) {
          const token = authToken();
          if (!token) throw new Error("session token unavailable in ServicesManager.AuthData");
          req.method("AddHeader").invoke(Il2Cpp.string("Authorization"), Il2Cpp.string("Bearer " + token));
        }
        stage = "Send";
        req.method("Send").invoke();
        log(`GET ${url} queued`);
      } catch (e) {
        log(`GET ${url} setup failed at ${stage}: ${e}`);
        cb(-1, String(e));
      }
    });
  }
  section("rewards refresh", () => {
    const pubSub = cls(img, "SparkleServices.PubSub");
    const createPush = pubSub.method("CreatePushNotification");
    const gameNetwork = cls(img, "SPTESL.GameNetworkManager");
    hookAttach(cls(img, "EndGameState").method("OnEnable").virtualAddress, {
      onEnter() {
        try {
          const instance = gameNetwork.method("get_Instance").invoke();
          const matchId = isNull(instance) ? "" : String(call(instance, "get_MatchId")?.content ?? "");
          const payload = JSON.stringify({ receivedRewards: true, matchId });
          createPush.invoke(Il2Cpp.string("matchrewards"), Il2Cpp.string(payload));
          log(`EndGameState: pushed matchrewards (${matchId || "no match id"})`);
        } catch (e) {
          log(`matchrewards push failed: ${e}`);
        }
      }
    });
    hookAttach(cls(img, "SoloArena").method("SoloArenaEndSequence").virtualAddress, {
      onEnter() {
        try {
          createPush.invoke(Il2Cpp.string("rewards"), Il2Cpp.string("{}"));
          log("SoloArena: pushed rewards");
        } catch (e) {
          log(`rewards push failed: ${e}`);
        }
      }
    });
  });
  const deckStats = /* @__PURE__ */ new Map();
  let matchEntryData = [];
  let statsFinishedLoading = false;
  let statsLoadingSince = 0;
  const pending = [];
  function schedule(delayMs, fn, tag) {
    pending.push({ at: Date.now() + delayMs, fn, tag });
  }
  function runPending() {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at > now) continue;
      const task = pending.splice(i, 1)[0];
      try {
        Il2Cpp.mainThread.schedule(() => {
          const started = Date.now();
          try {
            task.fn();
          } catch (e) {
            log(`scheduled task failed: ${e}`);
          }
          const took = Date.now() - started;
          const probe = globalThis.__teslRebornStallProbe;
          if (probe) probe.tasks++;
          if (took >= 100) log(`scheduled task slow ${took}ms (${task.tag || "untagged"})`);
        });
      } catch (e) {
        log(`could not schedule a task: ${e}`);
      }
    }
  }
  section("main thread scheduler", () => {
    const services = cls(img, "SparkleServices.ServicesManager");
    const update = services.methods.find((m) => m.name === "Update");
    if (!update) throw new Error("ServicesManager.Update not found");
    hookAttach(update.virtualAddress, { onEnter() {
      runPending();
    } });
  });
  section("main loop stall probe", () => {
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    const probe = globalThis.__teslRebornStallProbe = { loads: 0, tasks: 0 };
    let last = Date.now(), quietUntil = 0;
    hookAttach(update.virtualAddress, {
      onEnter() {
        const now = Date.now(), gap = now - last;
        last = now;
        const loads = probe.loads, tasks = probe.tasks;
        probe.loads = 0;
        probe.tasks = 0;
        if (gap >= 200 && gap < 6e4 && now >= quietUntil) {
          quietUntil = now + 1e3;
          log(`main loop stalled ${gap}ms` + (loads || tasks ? ` (asset loads ${loads}, tasks ${tasks})` : ""));
        }
      }
    });
  });
  let lastDeckStatsFetch = 0;
  function winRate(wins, losses) {
    const total = wins + losses;
    return total === 0 ? 0 : Math.round(wins * 100 / total);
  }
  function refreshDeckStats(force = false) {
    const base = endpointUrl(ENDPOINT_INVENTORY);
    if (!base) return;
    const now = Date.now();
    if (!force && now - lastDeckStatsFetch < 5e3) return;
    lastDeckStatsFetch = now;
    httpGet(`${base}/fetchDeckStats`, true, (status, body) => {
      if (status !== 200) {
        log(`fetchDeckStats -> HTTP ${status}`);
        return;
      }
      try {
        const json = JSON.parse(body);
        const items = json.items ?? json.data ?? [];
        deckStats.clear();
        for (const it of items) {
          deckStats.set(Number(it.deckId), { wins: Number(it.wins) | 0, losses: Number(it.losses) | 0 });
        }
        log(`deck stats: ${deckStats.size} decks`);
        refreshDeckTileLabels();
      } catch (e) {
        log(`fetchDeckStats parse error: ${e}`);
      }
    });
  }
  function refreshMatchEntries() {
    const base = endpointUrl(ENDPOINT_STATS);
    if (!base) return;
    httpGet(`${base}/fetchExtendedData`, true, (status, body) => {
      if (status !== 200) {
        log(`fetchExtendedData -> HTTP ${status}`);
        statsFinishedLoading = true;
        return;
      }
      try {
        const json = JSON.parse(body);
        const entries = json.entries ?? [];
        matchEntryData = entries.map((e) => ({
          playedAt: e.playedAt,
          deckId: Number(e.deckId),
          deckName: String(e.deckName ?? ""),
          deckStats: e.deckStats ? { wins: Number(e.deckStats.wins) | 0, losses: Number(e.deckStats.losses) | 0 } : null,
          opponentDeckName: String(e.opponentDeckName ?? ""),
          opponentDeckStats: e.opponentDeckStats ? { wins: Number(e.opponentDeckStats.wins) | 0, losses: Number(e.opponentDeckStats.losses) | 0 } : null
        }));
        statsFinishedLoading = true;
        log(`match history: ${matchEntryData.length} entries`);
        refreshHistoryTooltips();
      } catch (e) {
        log(`fetchExtendedData parse error: ${e}`);
        statsFinishedLoading = true;
      }
    });
  }
  section("stats and deck statistics", () => {
    hookAttach(cls(img, "SparkleServices.Stats").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field("resultCode").value) !== 0) return;
          statsFinishedLoading = false;
          statsLoadingSince = Date.now();
          refreshMatchEntries();
        } catch (e) {
          log(`stats hook failed: ${e}`);
        }
      }
    });
    hookAttach(cls(img, "SparkleServices.Inventory").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field("resultCode").value) !== 0) return;
          refreshDeckStats();
        } catch (e) {
          log(`inventory hook failed: ${e}`);
        }
      }
    });
    for (const name of ["CreateDeck", "SaveDeck", "DeleteDeck"]) {
      const method = cls(img, "SparkleServices.Inventory").method(name);
      if (!method) continue;
      hookAttach(method.virtualAddress, {
        onLeave() {
          schedule(1e3, () => refreshDeckStats(true), "deck stats refresh");
        }
      });
    }
    const getResponseStatus = cls(img, "SparkleServices.Stats").method("GetResponseStatus");
    if (getResponseStatus) {
      hookAttach(getResponseStatus.virtualAddress, {
        onEnter(args) {
          this.instance = args[0];
        },
        onLeave(retval) {
          try {
            if (isNull(this.instance)) return;
            const obj = new Il2Cpp.Object(this.instance);
            if (obj.class.namespace !== "SparkleServices" || obj.class.name !== "Stats") return;
            const original = retval.toInt32();
            const loading = !statsFinishedLoading && Date.now() - statsLoadingSince < 1e4;
            if (loading) {
              retval.replace(ptr(1));
              return;
            }
            if (original === 2) retval.replace(ptr(2));
          } catch (_) {
          }
        }
      });
    }
  });
  const deckTiles = /* @__PURE__ */ new Map();
  let deckUiCreated = 0, deckUiShown = 0, deckUiMissing = 0;
  let deckUiLastError = "", deckUiFailures = 0;
  function rememberDeckTile(tile) {
    const key = tile.handle.toString();
    let record = deckTiles.get(key);
    if (!record) {
      record = { tile: tile.weakRef(false), container: null, label: null, shown: false, missing: false, rect: null };
      deckTiles.set(key, record);
    }
    return record;
  }
  function forgetDeckTile(key) {
    const record = deckTiles.get(key);
    if (!record) return;
    for (const handle of [record.tile, record.container, record.label, record.rect]) {
      try {
        if (handle) handle.free();
      } catch (_) {
      }
    }
    deckTiles.delete(key);
  }
  function refreshDeckTileLabels() {
    for (const [key, record] of Array.from(deckTiles)) {
      try {
        const tile = record.tile.target;
        if (isNull(tile)) {
          forgetDeckTile(key);
          continue;
        }
        updateDeckTileLabel(tile);
      } catch (error) {
        forgetDeckTile(key);
        log(`stats UI: discarded destroyed tile: ${error}`);
      }
    }
  }
  function createDeckTileLabel(tile) {
    const record = rememberDeckTile(tile);
    if (record.container && record.label) return true;
    let container = null;
    const roots = [];
    const hold = (value) => {
      if (!isNull(value)) roots.push(value.ref(false));
      return value;
    };
    try {
      hold(tile);
      const nameText = hold(tile.field("DeckNameText").value);
      if (isNull(nameText)) return false;
      const ancestry = Array.from(nameText.class.hierarchy()).map((c) => c.type.name);
      const isTmp = ancestry.includes("TMPro.TextMeshProUGUI") || ancestry.includes("TMPro.TMP_Text");
      const isLegacy = ancestry.includes("UnityEngine.UI.Text");
      if (!isTmp && !isLegacy) throw Error(`Unsupported deck-name renderer: ${nameText.class.type.name}`);
      const parent = hold(call(tile, "get_transform"));
      if (isNull(parent)) return false;
      const rectType = ucls("UnityEngine.RectTransform");
      const gameObject = ucls("UnityEngine.GameObject");
      const layer = Number(call(call(parent, "get_gameObject"), "get_layer"));
      const makeUiObject = (name, parentTransform) => {
        const go = hold(newWith(
          gameObject,
          Il2Cpp.string(name),
          Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object])
        ));
        call(go, "set_layer", layer);
        call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(parentTransform, false);
        return go;
      };
      const rectOf = (go) => hold(go.method("GetComponent").overload("System.Type").invoke(rectType.type.object));
      const addComponent = (go, type) => hold(go.method("AddComponent").overload("System.Type").invoke(ucls(type).type.object));
      const stretch = (rect) => {
        call(rect, "set_anchorMin", vec2(0, 0));
        call(rect, "set_anchorMax", vec2(1, 1));
        call(rect, "set_offsetMin", vec2(0, 0));
        call(rect, "set_offsetMax", vec2(0, 0));
      };
      container = makeUiObject("WinLossRatioContainer", parent);
      call(container, "SetActive", false);
      const containerTransform = hold(call(container, "get_transform"));
      const containerRect = rectOf(container);
      call(containerRect, "set_anchorMin", vec2(1, 0));
      call(containerRect, "set_anchorMax", vec2(1, 0));
      call(containerRect, "set_pivot", vec2(1, 0));
      call(containerRect, "set_anchoredPosition", vec2(-1, 1));
      call(containerRect, "set_sizeDelta", vec2(100, 24));
      const background = makeUiObject("Background", containerTransform);
      stretch(rectOf(background));
      const backgroundImage = addComponent(background, "UnityEngine.UI.Image");
      call(backgroundImage, "set_color", rgba(0, 0, 0, 0.7));
      call(backgroundImage, "set_raycastTarget", false);
      const labelObject = makeUiObject("WinLossRatioLabel", containerTransform);
      stretch(rectOf(labelObject));
      const renderer = isTmp ? "TMPro.TextMeshProUGUI" : "UnityEngine.UI.Text";
      const label = addComponent(labelObject, renderer);
      const font = hold(call(nameText, "get_font"));
      if (isNull(font)) throw Error("DeckNameText has no font");
      call(label, "set_font", font);
      call(label, "set_fontSize", 16);
      if (isTmp) {
        call(label, "set_enableAutoSizing", false);
        const alignmentClass = ucls("TMPro.TextAlignmentOptions");
        const center = enumVal(alignmentClass.field("Center").value);
        call(label, "set_alignment", enumBox(alignmentClass, center));
        const wrapping = label.tryMethod("set_enableWordWrapping", 1);
        if (wrapping) wrapping.invoke(false);
      } else {
        call(label, "set_resizeTextForBestFit", false);
        call(label, "set_alignment", 4);
        call(label, "set_horizontalOverflow", 1);
        call(label, "set_verticalOverflow", 1);
      }
      call(label, "set_color", rgba(1, 1, 1, 1));
      call(label, "set_raycastTarget", false);
      call(label, "set_enabled", true);
      record.rect = containerRect.ref(false);
      record.container = container.ref(false);
      record.label = label.ref(false);
      if (++deckUiCreated <= 8) log(`stats UI: created panel ${deckUiCreated}, layer=${layer}, renderer=${renderer}, template=${nameText.class.type.name}`);
      return true;
    } catch (error) {
      if (container) {
        try {
          ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(container);
        } catch (_) {
        }
      }
      const detail = String(error);
      if (detail !== deckUiLastError) {
        deckUiLastError = detail;
        deckUiFailures = 0;
      }
      deckUiFailures++;
      if (deckUiFailures <= 3 || deckUiFailures % 25 === 0)
        log(`stats UI: creation failed (${deckUiFailures}): ${detail}`);
      return false;
    } finally {
      for (const root of roots.reverse()) root.free();
    }
  }
  function updateDeckTileLabel(tile) {
    const key = tile.handle.toString();
    try {
      const record = rememberDeckTile(tile);
      if (!createDeckTileLabel(tile)) return;
      const container = record.container.target;
      const label = record.label.target;
      if (isNull(container) || isNull(label)) {
        forgetDeckTile(key);
        return;
      }
      call(container, "SetActive", false);
      const deckId = Number(call(tile, "GetDeckId"));
      const stats = deckStats.get(deckId);
      if (!stats) {
        if (!record.missing && deckUiMissing++ < 8) log(`stats UI: no data for deckId=${deckId}, loaded=${deckStats.size}`);
        record.missing = true;
        return;
      }
      const text = `${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)`;
      call(label, "set_text", Il2Cpp.string(text));
      const width = Number(call(label, "get_preferredWidth"));
      if (!Number.isFinite(width) || width < 0) throw Error("Invalid statistics text width");
      call(record.rect.target, "set_sizeDelta", vec2(Math.ceil(width) + 6, 24));
      call(container, "SetActive", true);
      if (!record.shown && deckUiShown++ < 8) log(`stats UI: shown deckId=${deckId}, ${text}`);
      record.shown = true;
    } catch (error) {
      forgetDeckTile(key);
      log(`stats UI: update failed: ${error}`);
    }
  }
  section("deck tile win/loss label", () => {
    const deckTile = cls(img, "DeckTile");
    hookAttach(deckTile.method("SetData", 2).virtualAddress, {
      onEnter(args) {
        this.tile = args[0];
      },
      onLeave() {
        try {
          if (this.tile) updateDeckTileLabel(new Il2Cpp.Object(this.tile));
        } catch (error) {
          log(`stats UI: SetData failed: ${error}`);
        }
      }
    });
    const destroy = deckTile.methods.find((m) => m.name === "OnDestroy" && !m.isStatic && m.parameterCount === 0);
    if (destroy && !destroy.virtualAddress.isNull()) {
      hookAttach(destroy.virtualAddress, {
        onEnter(args) {
          forgetDeckTile(args[0].toString());
        }
      });
    }
  });
  const MONTH_KEYS = [
    "months.January",
    "months.February",
    "months.March",
    "months.April",
    "months.May",
    "months.June",
    "months.July",
    "months.August",
    "months.September",
    "months.October",
    "months.November",
    "months.December"
  ];
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  function monthName(month) {
    try {
      const lm = cls(img, "LocalizationManager").method("get_Instance").invoke();
      if (!isNull(lm)) {
        const text = call(lm, "GetText", MONTH_KEYS[month - 1]);
        if (text && text.content) return String(text.content);
      }
    } catch (_) {
    }
    return MONTH_NAMES[month - 1] ?? "";
  }
  function setNewsItem(item, title, content, date, url, primary) {
    const root = item.field("Root").value;
    if (!isNull(root)) root.method("SetActive").invoke(true);
    const titleText = item.field("TitleText").value;
    if (!isNull(titleText)) titleText.method("set_text").invoke(Il2Cpp.string(title));
    if (primary && content != null) {
      const description = item.field("DescriptionText").value;
      if (!isNull(description)) description.method("set_text").invoke(Il2Cpp.string(content));
    }
    const monthText = item.field("MonthText").value;
    if (!isNull(monthText)) monthText.method("set_text").invoke(Il2Cpp.string(monthName(date.getMonth() + 1)));
    const dayText = item.field("DayText").value;
    if (!isNull(dayText)) dayText.method("set_text").invoke(Il2Cpp.string(String(date.getDate())));
    const button = item.field("Button").value;
    if (isNull(button)) return;
    const onClick = call(button, "get_onClick");
    if (isNull(onClick)) return;
    onClick.method("RemoveAllListeners").invoke();
    const action = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
      try {
        ucls("UnityEngine.Application").method("OpenURL").invoke(Il2Cpp.string(url));
      } catch (_) {
      }
    });
    onClick.method("AddListener").invoke(action);
  }
  function loadRebornNews(widget) {
    httpGet(NEWS_URL, false, (status, body) => {
      try {
        if (status !== 200) {
          log(`news: HTTP ${status}`);
          return;
        }
        const json = JSON.parse(body);
        const items = json.items ?? [];
        const primary = widget.field("_primaryNewsItem").value;
        const secondary = widget.field("_secondaryNewsItems").value;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const date = new Date(String(item.createdAt).replace(" ", "T"));
          if (i === 0) {
            if (!isNull(primary)) setNewsItem(primary, String(item.title ?? ""), String(item.content ?? ""), date, String(item.url ?? ""), true);
          } else if (!isNull(secondary) && i - 1 < secondary.length) {
            const entry = secondary.get(i - 1);
            if (!isNull(entry)) setNewsItem(entry, String(item.title ?? ""), null, date, String(item.url ?? ""), false);
          }
        }
        const loading = widget.field("_loadingUi").value;
        if (!isNull(loading)) loading.method("SetActive").invoke(false);
        const unavailable = widget.field("_unavailableUi").value;
        if (!isNull(unavailable)) unavailable.method("SetActive").invoke(false);
        widget.field("_loadInProgress").value = false;
        log(`news: ${items.length} items`);
      } catch (e) {
        log(`news failed: ${e}`);
      }
    });
  }
  section("news from tesl-reborn", () => {
    const widget = cls(img, "MenuNewsWidget");
    const iterator = img.classes.find((c) => c.name === "<LoadNews>c__Iterator0" && c.declaringClass?.name === "MenuNewsWidget");
    if (iterator) {
      const moveNext = iterator.methods.find((m) => m.name === "MoveNext");
      if (moveNext) {
        hookAttach(moveNext.virtualAddress, {
          onLeave(retval) {
            retval.replace(ptr(0));
          }
          // finish the coroutine at once
        });
      }
    } else log("news: the game's news coroutine was not found");
    hookAttach(widget.method("OnEnable").virtualAddress, {
      onEnter(args) {
        try {
          const self = new Il2Cpp.Object(args[0]);
          self.field("_lastShownShownLanguage").value = Il2Cpp.string("en");
          loadRebornNews(self);
        } catch (e) {
          log(`news hook failed: ${e}`);
        }
      }
    });
  });
  section("custom titles and scenario image", () => {
    const config = cls(img, "SPTESL.GameConfiguration");
    const titleData = cls(img, "SPTESL.TitleData");
    const iterator = img.classes.find((c) => c.name === "<LoadGameConfigurationAtRuntime>c__Iterator0" && c.declaringClass?.name === "GameConfiguration");
    if (!iterator) throw new Error("the configuration coroutine was not found");
    const moveNext = iterator.methods.find((m) => m.name === "MoveNext");
    if (!moveNext) throw new Error("the configuration coroutine has no MoveNext");
    let applied = false;
    hookAttach(moveNext.virtualAddress, {
      onEnter(args) {
        this.iterator = new Il2Cpp.Object(args[0]);
      },
      onLeave(retval) {
        if (applied) return;
        if (retval.toInt32() !== 0) return;
        applied = true;
        try {
          const instance = this.iterator.field("$this").value;
          if (isNull(instance)) return;
          addCustomTitles(instance, titleData);
          fixFrostTrollScenario(instance);
          log("game configuration: custom titles and scenario image applied");
        } catch (e) {
          log(`game configuration patch failed: ${e}`);
        }
      }
    });
    function addCustomTitles(instance, titleClass) {
      const titles = instance.field("Titles").value;
      if (isNull(titles)) return;
      const existing = titles.method("get_Count").invoke();
      for (const spec of [
        { id: -900988265, name: "title_reborn_keeper", title: "reborn.titles.keeper.title", desc: "reborn.titles.keeper.description" },
        { id: -314134087, name: "title_reborn_founder", title: "reborn.titles.founder.title", desc: "reborn.titles.founder.description" }
      ]) {
        if (titleExists(titles, spec.name)) continue;
        const data = newWith(titleClass);
        const resourceId = data.field("ResourceId").value;
        resourceId.field("Id").value = spec.id;
        resourceId.field("UniqueName").value = Il2Cpp.string(spec.name);
        resourceId.field("CompletionType").value = enumBox(cls(img, "SPTESL.ResourceCompletionType"), 1);
        data.field("Title").value.field("RawKey").value = Il2Cpp.string(spec.title);
        data.field("Description").value.field("RawKey").value = Il2Cpp.string(spec.desc);
        data.field("Rarity").value = enumBox(cls(img, "SPTESL.CardRarity"), RARITY_LEGENDARY);
        data.field("Hidden").value = false;
        titles.method("Add").invoke(data);
        const check = titles.method("get_Item", 1).invoke(Number(titles.method("get_Count").invoke()) - 1);
        const checkName = check.field("ResourceId").value.field("UniqueName").value?.content;
        const checkTitle = check.field("Title").value.field("RawKey").value?.content;
        log(`game configuration: added title ${checkName} (${checkTitle})`);
      }
      log(`game configuration: ${existing} + 2 titles`);
    }
    function titleExists(titles, uniqueName) {
      try {
        const count = Number(titles.method("get_Count").invoke());
        for (let i = 0; i < count; i++) {
          const entry = titles.method("get_Item", 1).invoke(i);
          if (isNull(entry)) continue;
          const name = entry.field("ResourceId").value.field("UniqueName").value?.content;
          if (name === uniqueName) return true;
        }
      } catch (_) {
      }
      return false;
    }
    function rarityValue(rarity) {
      return enumBox(cls(img, "SPTESL.CardRarity"), rarity);
    }
    function fixFrostTrollScenario(instance) {
      const scenarios = instance.field("Scenarios").value;
      if (isNull(scenarios)) return;
      const count = Number(scenarios.method("get_Count").invoke());
      for (let i = 0; i < count; i++) {
        const scenario = scenarios.method("get_Item", 1).invoke(i);
        if (isNull(scenario)) continue;
        const name = scenario.field("ResourceId").value.field("UniqueName").value?.content;
        if (name !== "CWC_M_Act1_Ep2_FrostTroll_B" && name !== "CWC_Act1_Ep2_FrostTroll_B") continue;
        const modal = scenario.field("IntroModalData").value;
        if (isNull(modal)) continue;
        const overview = modal.field("OverviewSection").value;
        if (isNull(overview)) continue;
        overview.field("Image").value = Il2Cpp.string("ContentPack000/Cards/Visuals/Ice_Storm_v2/Ice_Storm_v2");
        log(`game configuration: fixed the scenario image of ${name}`);
      }
    }
  });
  function countOf(dictionary) {
    if (isNull(dictionary)) return 0;
    try {
      return Number(dictionary.method("get_Count").invoke());
    } catch (_) {
      return 0;
    }
  }
  function restoreLocalization(manager, code) {
    try {
      let text = "";
      const selected = resourceLanguage() || code;
      const regional = selected.includes("_") ? selected.slice(0, 2) + "_" + selected.slice(3).toUpperCase() : selected;
      for (const name of [selected, regional, shortLanguage(selected)]) {
        text = readTextFile(`${persistentPath()}/tesl-localization-${name}.json`);
        if (text) break;
      }
      if (!text) return 0;
      const json = JSON.parse(text);
      const keys = Object.keys(json);
      if (keys.length === 0) return 0;
      const stringClass = Il2Cpp.corlib.class("System.String");
      const dictionary = Il2Cpp.corlib.class("System.Collections.Generic.Dictionary`2").inflate(stringClass, stringClass).new();
      const retained = dictionary.ref(false);
      try {
        for (const key of keys) {
          retained.target.method("set_Item").invoke(Il2Cpp.string(key), Il2Cpp.string(String(json[key])));
        }
        const fixes = TRANSLATIONS[selected] || TRANSLATIONS[shortLanguage(selected)] || {};
        for (const key of Object.keys(fixes))
          retained.target.method("set_Item").invoke(Il2Cpp.string(key), Il2Cpp.string(fixes[key]));
        manager.field("_localizedData").value = retained.target;
      } finally {
        retained.free();
      }
      return keys.length;
    } catch (e) {
      log(`could not restore the localization: ${e}`);
      return 0;
    }
  }
  let resourceSettingsWindow = null;
  function resourceLanguage() {
    try {
      const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
      if (choice && /^(en_us|de_de|es_es|es_mx|fr_fr|it_it|pl_pl|pt_br|ru_ru|tr_tr)$/.test(choice.language)) return choice.language;
    } catch (_) {
    }
    return "";
  }
  function languageSetupUri(query) {
    let host = "resources";
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "{}");
      if (setup.languageTransition === true) host = "language";
    } catch (_) {
    }
    return "teslreborn://" + host + "?" + query;
  }
  function resourceSettingsOpen() {
    try {
      return resourceSettingsWindow != null && Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy"));
    } catch (_) {
      return false;
    }
  }
  function shortLanguage(code) {
    return String(code).toLowerCase().replace("-", "_").split("_")[0];
  }
  function localizedGameUri(uri, code) {
    if (!code || !/^https?:\/\/(?:[a-z0-9-]+\.)?tesl-reborn\.com(?=[:/]|$)/i.test(uri)) return uri;
    return uri.replace(/([?&](?:language|locale)=)([^&#]*)/gi, (_, prefix, old) => prefix + shapedLanguage(code, decodeURIComponent(old)));
  }
  function localizedAssetPath(path, code) {
    if (!code) return path;
    return path.replace(
      /(\/Localization\/(?:Text|Audio)\/)(?:en|de|es|fr|it|pl|pt|ru|tr)(?:[_-][a-z]{2})?(?=\/|$)/gi,
      (_, prefix) => prefix + code.slice(0, 2) + "_" + code.slice(3).toUpperCase()
    );
  }
  function shapedLanguage(code, old) {
    return /[_-]/.test(old) ? code.slice(0, 2) + "_" + code.slice(3).toUpperCase() : code.slice(0, 2);
  }
  function languageLabel(text) {
    const label = String(text).replace(/<[^>]*>/g, "").toLowerCase().replace(/[\s()_-]/g, "");
    const native = {
      en_us: ["english", "englishus", "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439"],
      de_de: ["deutsch", "german", "\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u0439"],
      es_es: ["espa\xF1ol", "spanish", "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438\u0439"],
      es_mx: ["espa\xF1olmexicano", "espa\xF1ollatinoam\xE9rica", "latinamericanspanish", "espa\xF1olm\xE9xico"],
      fr_fr: ["fran\xE7ais", "french", "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u0441\u043A\u0438\u0439"],
      it_it: ["italiano", "italian", "\u0438\u0442\u0430\u043B\u044C\u044F\u043D\u0441\u043A\u0438\u0439"],
      pl_pl: ["polski", "polish", "\u043F\u043E\u043B\u044C\u0441\u043A\u0438\u0439"],
      pt_br: ["portugu\xEAsbrasil", "brazilianportuguese", "portugu\xEAs", "portuguese"],
      ru_ru: ["\u0440\u0443\u0441\u0441\u043A\u0438\u0439", "\u0440\u0443\u0441\u0441\u043A\u0438\u0439\u044F\u0437\u044B\u043A", "russian"],
      tr_tr: ["t\xFCrk\xE7e", "turkish", "\u0442\u0443\u0440\u0435\u0446\u043A\u0438\u0439"]
    };
    return Object.keys(native).find((code) => native[code].includes(label));
  }
  section("translation fixes", () => {
    const localization = cls(img, "LocalizationManager");
    let lastLanguage = "", lastRestored = "", lastRestoredDictionary = "", lastFixed = "", loaded = false, switching = false, languageInputDepth = 0, recentInputAt = 0, recentExplicitInputAt = 0, switchingAt = 0;
    function noteLanguageInput() {
      try {
        const input = ucls("UnityEngine.Input");
        if (Number(input.method("get_touchCount", 0).invoke()) > 0 || input.method("GetMouseButtonDown", 1).invoke(0) || input.method("GetMouseButtonUp", 1).invoke(0)) {
          recentExplicitInputAt = Date.now();
          if (resourceSettingsOpen()) recentInputAt = recentExplicitInputAt;
        }
      } catch (_) {
      }
    }
    try {
      hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
        onEnter() {
          noteLanguageInput();
        }
      });
    } catch (error) {
      log(`resources: settings input trace unavailable: ${error}`);
    }
    const languageHandlers = /* @__PURE__ */ new Set();
    for (const owner of img.classes.filter((c) => /settings|options|language/i.test(c.name))) {
      for (const method of owner.methods.filter((m) => /^(On.*(?:Language|Locale|Lang|ValueChanged|SelectionChanged).*|(?:Select|Change|Set).*(?:Language|Locale|Lang)|LanguageChanged)$/i.test(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
        const key = method.virtualAddress.toString();
        if (languageHandlers.has(key)) continue;
        languageHandlers.add(key);
        hookAttach(method.virtualAddress, {
          onEnter() {
            languageInputDepth++;
          },
          onLeave() {
            languageInputDepth = Math.max(0, languageInputDepth - 1);
          }
        });
      }
    }
    const languageNames = {
      en_us: ["english", "en"],
      de_de: ["german", "de"],
      es_es: ["spanish", "es"],
      es_mx: ["mexicanspanish", "spanishmexican", "latinamericanspanish", "spanishlatinamerica"],
      fr_fr: ["french", "fr"],
      it_it: ["italian", "it"],
      pl_pl: ["polish", "pl"],
      pt_br: ["brazilianportuguese", "portuguesebrazilian", "portuguese", "pt"],
      ru_ru: ["russian", "ru"],
      tr_tr: ["turkish", "tr"]
    };
    function requestLanguage(target, current, explicit = false) {
      if (globalThis.__teslLanguageSyncing) return false;
      noteLanguageInput();
      if (!explicit && (!target || target === current || !loaded || !recentInputAt || Date.now() - recentInputAt > 3e3)) return false;
      if (switching && Date.now() - switchingAt < 1500 || target && target === current) return true;
      switching = true;
      switchingAt = Date.now();
      const link = target ? "language=" + target + "&apply=1" : "chooseLanguage=1";
      try {
        writeTextFile(`${persistentPath()}/tesl-reborn-language-status.json`, JSON.stringify({
          revision: 30,
          status: "opening-game-data",
          current,
          requested: target || "chooser",
          at: (/* @__PURE__ */ new Date()).toISOString()
        }));
      } catch (_) {
      }
      log(`resources: language control -> Game data (${target || "chooser"}); native handler suppressed`);
      schedule(0, () => {
        try {
          ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string(languageSetupUri(link)));
        } catch (error) {
          switching = false;
          log(`resources: could not open language setup: ${error}`);
        }
      });
      return true;
    }
    const replacedLanguageControls = /* @__PURE__ */ new Set();
    function replaceLanguageControl(method, route) {
      if (!method || method.isStatic || method.virtualAddress.isNull()) return;
      const key = method.virtualAddress.toString();
      if (replacedLanguageControls.has(key)) return;
      replacedLanguageControls.add(key);
      method.implementation = function(...args) {
        try {
          if (route(this, args)) return;
        } catch (error) {
          log(`resources: language control ${method.name}: ${error}`);
        }
        return method.invokeRaw(this.handle, ...args);
      };
    }
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) {
      try {
        replaceLanguageControl(ucls(name).tryMethod("Show", 0), (self) => {
          if (globalThis.__teslNativeLanguageCallback) return false;
          const options = call(self, "get_options"), count = Number(call(options, "get_Count"));
          if (count < 2 || count > 16) return false;
          let recognized = 0;
          for (let i = 0; i < count; i++) if (languageLabel(String(call(call(options, "get_Item", i), "get_text")?.content || ""))) recognized++;
          if (recognized < 2) return false;
          return requestLanguage(void 0, resourceLanguage(), true);
        });
      } catch (error) {
        log(`resources: ${name} language entry: ${error}`);
      }
    }
    try {
      replaceLanguageControl(ucls("UnityEngine.UI.Button").tryMethod("Press", 0), (self) => {
        settingsButtonPressed(self);
        if (globalThis.__teslNativeLanguageCallback) return false;
        const event = call(self, "get_onClick"), count = Number(call(event, "GetPersistentEventCount"));
        let languageAction = false;
        for (let i = 0; i < count; i++) {
          const name = String(call(event, "GetPersistentMethodName", i)?.content || "");
          if (/^(?:On|Show|Open|Select|Change|Choose|Set).*(?:Language|Locale)/i.test(name)) languageAction = true;
        }
        if (!languageAction) {
          const node = call(self, "get_transform");
          const name = String(call(node, "get_name")?.content || "");
          languageAction = /language|locale/i.test(name) && !/cancel|close|back|download/i.test(name);
        }
        if (!languageAction) return false;
        return requestLanguage(void 0, resourceLanguage(), true);
      });
    } catch (error) {
      log(`resources: language button entry: ${error}`);
    }
    for (const owner of img.classes.filter((c) => /settings|options|language/i.test(c.name))) {
      let component = false;
      try {
        component = Array.from(owner.hierarchy()).some((base) => base.type.name === "UnityEngine.Component");
      } catch (_) {
      }
      if (!component) continue;
      for (const method of owner.methods.filter((m) => /^(?:On|Select|Change|Choose|Show|Open).*Language/i.test(m.name) && !/load|ready|initializ|complete|response|success/i.test(m.name) && m.returnType.name === "System.Void" && m.parameterCount <= 1)) {
        replaceLanguageControl(method, (self, args) => {
          if (!Boolean(call(call(self, "get_gameObject"), "get_activeInHierarchy"))) return false;
          noteLanguageInput();
          if (!recentExplicitInputAt || Date.now() - recentExplicitInputAt > 3e3) return false;
          let target;
          if (method.parameterCount === 1) {
            const type = method.parameters[0].type;
            if (type.name === "System.String") target = languageLabel(args[0]?.content || "");
            else if (type.class.isEnum) {
              const field = type.class.fields.find((f) => f.isStatic && enumVal(f.value) === Number(args[0]));
              target = field && Object.keys(languageNames).find((code) => languageNames[code].includes(field.name.toLowerCase().replace(/[^a-z]/g, "")));
            }
          }
          return requestLanguage(target, resourceLanguage(), true);
        });
      }
    }
    for (const owner of img.classes) for (const method of owner.methods.filter((m) => /^(?:set_(?:GameLanguage|Language|LanguageCode|CurrentLanguage|SelectedLanguage|Locale|LocaleCode)|Set(?:Game|Client)?Language|(?:On|Select|Change).*Language.*)$/i.test(m.name) && m.parameterCount >= 1 && !m.isStatic && owner !== localization && !m.virtualAddress.isNull())) {
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          try {
            const type = method.parameters[0].type;
            let requested = "";
            if (type.name === "System.String") requested = rawStr(args[1]);
            else if (type.class.isEnum) requested = type.class.fields.find((f) => f.isStatic && enumVal(f.value) === args[1].toInt32())?.name || "";
            const normalized = requested.toLowerCase().replace("-", "_");
            const target = Object.keys(languageNames).find((code) => code === normalized || languageNames[code].includes(normalized.replace(/[^a-z]/g, "")));
            if (target) requestLanguage(target, resourceLanguage());
          } catch (error) {
            log(`resources: settings language setter ${owner.name}.${method.name}: ${error}`);
          }
        }
      });
    }
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) {
      try {
        const dropdown = ucls(name), method = dropdown.tryMethod("OnSelectItem", 1) || dropdown.tryMethod("Set", 2) || dropdown.tryMethod("set_value", 1);
        if (!method || method.virtualAddress.isNull()) continue;
        hookAttach(method.virtualAddress, {
          onEnter(args) {
            this.index = method.name === "OnSelectItem" ? null : args[1].toInt32();
            this.active = !globalThis.__teslNativeLanguageCallback && resourceSettingsOpen() && (method.name === "OnSelectItem" || method.parameterCount < 2 || args[2].toInt32() !== 0);
            if (this.active) this.dropdown = new Il2Cpp.Object(args[0]).ref(false);
          },
          onLeave() {
            if (!this.dropdown) return;
            const retained = this.dropdown, index = this.index;
            schedule(0, () => {
              try {
                const selectedIndex = index == null ? Number(call(retained.target, "get_value")) : index;
                const options = call(retained.target, "get_options"), count = Number(call(options, "get_Count"));
                if (selectedIndex < 0 || selectedIndex >= count || count < 2 || count > 16) return;
                const labels = [];
                for (let i = 0; i < count; i++) labels.push(languageLabel(String(call(call(options, "get_Item", i), "get_text")?.content || "")));
                if (labels.filter(Boolean).length >= 2 && labels[selectedIndex]) requestLanguage(labels[selectedIndex], resourceLanguage());
              } catch (error) {
                log(`resources: language dropdown: ${error}`);
              } finally {
                retained.free();
              }
            });
          }
        });
      } catch (_) {
      }
    }
    const setLanguage = localization.method("SetLanguage", 2);
    hookAttach(setLanguage.virtualAddress, {
      onEnter(args) {
        try {
          const choice = resourceLanguage();
          if (!choice) return;
          const index = setLanguage.isStatic ? 0 : 1, type = setLanguage.parameters[0].type;
          if (type.name === "System.String") {
            const old = rawStr(args[index]);
            const normalized = old.toLowerCase().replace("-", "_");
            requestLanguage(Object.keys(languageNames).includes(normalized) ? normalized : Object.keys(languageNames).find((c) => shortLanguage(c) === shortLanguage(old) || languageNames[c].includes(normalized.replace(/[^a-z]/g, ""))), choice);
            this.languageString = Il2Cpp.string(shapedLanguage(choice, old)).object.ref(false);
            args[index] = this.languageString.target.handle;
          } else if (type.class.isEnum) {
            const requested = type.class.fields.find((f) => f.isStatic && enumVal(f.value) === args[index].toInt32());
            if (requested) requestLanguage(Object.keys(languageNames).find((c) => languageNames[c].includes(requested.name.toLowerCase().replace(/[^a-z]/g, ""))), choice);
            const field = type.class.fields.find((f) => f.isStatic && languageNames[choice].includes(f.name.toLowerCase().replace(/[^a-z]/g, "")));
            if (field) {
              const value = enumVal(field.value);
              if (value >= 0) args[index] = ptr(value);
            }
          }
          log(`resources: language ${choice}; SetLanguage parameter=${type.name}`);
        } catch (error) {
          log(`resources: language override unavailable: ${error}`);
        }
      },
      onLeave() {
        if (this.languageString) this.languageString.free();
      }
    });
    const pinnedStrings = /* @__PURE__ */ new Map();
    const prefs = ucls("UnityEngine.PlayerPrefs");
    for (const method of prefs.methods.filter((m) => m.name === "SetString" && m.parameterCount === 2)) {
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          const key = rawStr(args[0]);
          if (!/^(language|languagecode|selectedlanguage|currentlanguage|locale|loccode)$/i.test(key)) return;
          const value = rawStr(args[1]).toLowerCase().replace("-", "_");
          const target = Object.keys(languageNames).find((code) => code === value || languageNames[code].includes(value.replace(/[^a-z]/g, "")));
          requestLanguage(target, resourceLanguage());
        }
      });
    }
    for (const method of prefs.methods.filter((m) => m.name === "GetString" && m.parameterCount >= 1)) {
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.key = rawStr(args[0]);
        },
        onLeave(result) {
          if (!/^(language|languagecode|selectedlanguage|currentlanguage|locale|loccode)$/i.test(this.key || "")) return;
          const choice = resourceLanguage();
          if (!choice) return;
          const old = rawStr(result), value = shapedLanguage(choice, old);
          if (!pinnedStrings.has(value)) pinnedStrings.set(value, Il2Cpp.string(value).object.ref(false));
          result.replace(pinnedStrings.get(value).target.handle);
          log(`resources: language preference ${this.key}=${value}`);
        }
      });
    }
    const systemLanguage = ucls("UnityEngine.Application").tryMethod("get_systemLanguage", 0);
    if (systemLanguage) hookAttach(systemLanguage.virtualAddress, {
      onLeave(result) {
        const choice = resourceLanguage();
        if (!choice) return;
        const names = choice === "es_mx" ? ["spanish"] : languageNames[choice];
        const field = systemLanguage.returnType.class.fields.find((f) => f.isStatic && names.includes(f.name.toLowerCase()));
        if (field) result.replace(ptr(enumVal(field.value)));
      }
    });
    hookAttach(localization.method("UpdateObjects").virtualAddress, {
      onEnter(args) {
        try {
          const manager = new Il2Cpp.Object(args[0]);
          const code = String(call(manager, "get_CurrentLanguageCode")?.content ?? "en");
          let data = manager.field("_localizedData").value;
          let entries = countOf(data);
          const saved = resourceLanguage();
          const selection = saved || code;
          if (entries === 0 || lastLanguage !== code || lastRestored !== selection || lastRestoredDictionary !== String(data?.handle)) {
            const restored = restoreLocalization(manager, code);
            if (restored > 0) {
              lastRestored = selection;
              log(`localization: restored ${restored} strings for ${selection}; Unity locale ${code}`);
            }
            data = manager.field("_localizedData").value;
            entries = countOf(data);
            lastRestoredDictionary = String(data?.handle);
          }
          loaded = entries > 0;
          const fixes = TRANSLATIONS[saved] || TRANSLATIONS[shortLanguage(selection)] || TRANSLATIONS[code];
          if (lastLanguage !== code) {
            lastLanguage = code;
            log(`localization: language ${code}, ${entries} strings${fixes ? "" : ", no fixes for it"}`);
          }
          if (!fixes) return;
          if (isNull(data)) return;
          const fingerprint = `${selection}:${data.handle}`;
          if (lastFixed === fingerprint) return;
          lastFixed = fingerprint;
          let changed = 0;
          for (const key of Object.keys(fixes)) {
            data.method("set_Item").invoke(Il2Cpp.string(key), Il2Cpp.string(fixes[key]));
            changed++;
          }
          log(`localization: applied ${changed} translation fixes`);
        } catch (e) {
          log(`translation fixes failed: ${e}`);
        }
      }
    });
  });
  class ZipReader {
    constructor(path) {
      __publicField(this, "file", null);
      __publicField(this, "entries", /* @__PURE__ */ new Map());
      try {
        this.file = new File(path, "rb");
        this.file.seek(0, File.SEEK_END);
        const length = this.file.tell();
        const tail = Math.min(length, 65536);
        this.file.seek(length - tail);
        const view = new DataView(this.file.readBytes(tail));
        let eocd = -1;
        for (let i = tail - 22; i >= 0; i--) {
          if (view.getUint32(i, true) === 101010256) {
            eocd = i;
            break;
          }
        }
        if (eocd < 0) throw new Error("no central directory");
        const count = view.getUint16(eocd + 10, true);
        let at = view.getUint32(eocd + 16, true);
        for (let i = 0; i < count; i++) {
          this.file.seek(at);
          const head = new DataView(this.file.readBytes(46));
          const method = head.getUint16(10, true);
          const size = head.getUint32(24, true);
          const nameLen = head.getUint16(28, true);
          const extraLen = head.getUint16(30, true);
          const commentLen = head.getUint16(32, true);
          const offset = head.getUint32(42, true);
          this.file.seek(at + 46);
          const name = readString(this.file.readBytes(nameLen));
          this.entries.set(name, { method, size, offset });
          at += 46 + nameLen + extraLen + commentLen;
        }
      } catch (e) {
        log(`payload: the apk cannot be read: ${e}`);
        try {
          this.file?.close();
        } catch (_) {
        }
        this.file = null;
      }
    }
    close() {
      try {
        this.file?.close();
      } finally {
        this.file = null;
      }
    }
    valid() {
      return this.file !== null;
    }
    find(name) {
      return this.entries.get(name) ?? null;
    }
    list() {
      return [...this.entries.keys()];
    }
    read(entry, from, length) {
      this.file.seek(this.dataOffset(entry) + from);
      return this.file.readBytes(length);
    }
    copy(entry, target) {
      if (entry.method !== 0) throw Error("Legacy payload must be stored");
      const part = target + ".part", out = new File(part, "wb");
      try {
        let done = 0;
        while (done < entry.size) {
          const n = Math.min(4 * 1024 * 1024, entry.size - done), bytes = this.read(entry, done, n);
          if (bytes.byteLength !== n) throw Error("Truncated APK payload");
          out.write(bytes);
          done += n;
        }
        out.flush();
      } finally {
        out.close();
      }
      if (!atomicRename(part, target)) throw Error("Could not commit APK payload");
    }
    dataOffset(entry) {
      this.file.seek(entry.offset);
      const head = new DataView(this.file.readBytes(30));
      return entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    }
  }
  section("payload from the apk", () => {
    const apk = apkPath();
    if (!apk) {
      log("payload: the apk was not found");
      return;
    }
    const zip = new ZipReader(apk);
    if (!zip.valid()) return;
    try {
      const emojiHashes = {
        "people.json": "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d",
        "people.png": "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa"
      };
      for (const [name, expected] of Object.entries(emojiHashes)) {
        const entry = zip.find(`assets/tesl-reborn/emojis/${name}`);
        if (!entry) {
          log(`emoji payload: missing ${name}`);
          continue;
        }
        if (entry.method !== 0 || entry.size > 2 * 1024 * 1024) throw Error("Invalid emoji APK entry");
        const directory = `${persistentPath()}/tesl-reborn-emojis`;
        const target = `${directory}/${name}`;
        let current = false;
        try {
          current = Checksum.compute("sha256", File.readAllBytes(target)) === expected;
        } catch (_) {
        }
        if (current) continue;
        makeDirectory(directory);
        zip.copy(entry, target);
        if (Checksum.compute("sha256", File.readAllBytes(target)) !== expected) throw Error(`Invalid emoji payload: ${name}`);
        log(`emoji payload: restored ${name}`);
      }
      const obb = zip.find("assets/tesl-payload/obb.bin");
      const cache = zip.find("assets/tesl-payload/cache.bin");
      const perFileEntries = zip.list().filter((e) => e.startsWith("assets/tesl-payload/UnityCache/Shared/"));
      if (!obb && !cache && !perFileEntries.length) {
        log("payload: the apk carries no payload");
        return;
      }
      if (obb) {
        const target = obbPath();
        if (target && fileSize(target) !== obb.size) {
          log(`payload: writing the streaming assets to ${target}`);
          makeDirectory(target.substring(0, target.lastIndexOf("/")));
          zip.copy(obb, target);
          log("payload: the streaming assets are ready");
        }
      }
      if (cache) {
        const target = `${persistentPath()}/UnityCache/Shared`;
        const head = new DataView(zip.read(cache, 0, 12));
        const count = head.getUint32(8, true);
        let at = 12;
        const files = [];
        for (let i = 0; i < count; i++) {
          const len = new DataView(zip.read(cache, at, 2)).getUint16(0, true);
          at += 2;
          const name = readString(zip.read(cache, at, len));
          at += len;
          const size = readUInt64(new DataView(zip.read(cache, at, 8)));
          at += 8;
          files.push({ name, size });
        }
        let offset = at;
        let written = 0;
        for (const f of files) {
          const path = `${target}/${f.name}`;
          if (!fileExists(path)) {
            makeDirectory(path.substring(0, path.lastIndexOf("/")));
            const out = new File(path, "wb");
            let done = 0;
            while (done < f.size) {
              const n = Math.min(4 * 1024 * 1024, f.size - done);
              out.write(zip.read(cache, offset + done, n));
              done += n;
            }
            out.close();
            written++;
          }
          offset += f.size;
        }
        log(`payload: ${written} of ${count} cache files written (packed)`);
      } else {
        const prefix = "assets/tesl-payload/UnityCache/Shared/";
        const perEntry = zip.list().filter((e) => e.startsWith(prefix));
        if (perEntry.length) {
          const tgt = `${persistentPath()}/UnityCache/Shared`;
          let written = 0;
          for (const name of perEntry) {
            const rel = name.substring(prefix.length);
            const path = `${tgt}/${rel}`;
            const e = zip.find(name);
            if (fileSize(path) !== e.size) {
              makeDirectory(path.substring(0, path.lastIndexOf("/")));
              zip.copy(e, path);
              written++;
            }
          }
          log(`payload: ${written} of ${perEntry.length} cache files written (per-file)`);
        }
      }
      const versions = zip.find("assets/tesl-payload/versions.json");
      if (versions) {
        const target = `${persistentPath()}/versions.json`;
        if (!fileExists(target)) {
          log("payload: writing versions.json");
          makeDirectory(target.substring(0, target.lastIndexOf("/")));
          zip.copy(versions, target);
        }
      }
    } finally {
      zip.close();
    }
  });
  function apkPath() {
    try {
      const f = new File("/proc/self/maps", "rb");
      let line = "";
      let fallback = "";
      while ((line = f.readLine()) !== "") {
        const matches = line.match(/(\/[^\s]+\.apk)/g);
        if (matches) for (const cand of matches) {
          if (cand.indexOf("base.apk") >= 0) {
            try {
              f.close();
            } catch (_) {
            }
            ;
            return cand;
          }
          if (!fallback) fallback = cand;
        }
      }
      try {
        f.close();
      } catch (_) {
      }
      if (fallback) return fallback;
    } catch (_) {
    }
    try {
      const path = String(ucls("UnityEngine.Application").method("get_streamingAssetsPath").invoke()?.content ?? "");
      const m = path.match(/^jar:file:\/\/(.*)!.*$/);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  }
  function obbPath() {
    const persistent = persistentPath();
    const android = persistent.replace(/\/data\/[^/]+\/files$/, "");
    return `${android}/obb/com.bethsoft.theelderscrollslegends/main.11009.com.bethsoft.theelderscrollslegends.obb`;
  }
  function fileSize(path) {
    try {
      const f = new File(path, "rb");
      try {
        f.seek(0, File.SEEK_END);
        return f.tell();
      } finally {
        f.close();
      }
    } catch (_) {
      return -1;
    }
  }
  function fileExists(path) {
    try {
      return Boolean(Il2Cpp.corlib.class("System.IO.File").method("Exists").invoke(Il2Cpp.string(path)));
    } catch (_) {
      return false;
    }
  }
  function makeDirectory(path) {
    try {
      Il2Cpp.corlib.class("System.IO.Directory").method("CreateDirectory").invoke(Il2Cpp.string(path));
    } catch (e) {
      log(`payload: cannot create ${path}: ${e}`);
    }
  }
  function readString(buffer) {
    const bytes = new Uint8Array(buffer);
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return text;
  }
  function readUInt64(view) {
    const low = view.getUint32(0, true);
    const high = view.getUint32(4, true);
    return low + high * 4294967296;
  }
  const LOGIN_FILE = "tesl-login.json";
  let autoLoginTried = false;
  function readSavedLogin() {
    try {
      const text = readTextFile(`${persistentPath()}/${LOGIN_FILE}`);
      if (!text) return null;
      const json = JSON.parse(text);
      if (!json || !json.username) return null;
      return { username: String(json.username), password: String(json.password ?? "") };
    } catch (e) {
      return null;
    }
  }
  function writeSavedLogin(username, password) {
    if (!username) return;
    const path = `${persistentPath()}/${LOGIN_FILE}`;
    if (!writeTextFile(path + ".part", JSON.stringify({ username, password }))) {
      log("login: credential write failed");
      return;
    }
    if (atomicRename(path + ".part", path)) log("login: saved username and credential state");
    else log("login: could not commit saved credentials; previous file retained");
  }
  function prefillLoginUsername(username) {
    if (!username) return;
    for (const delay of [0, 300, 1200]) schedule(delay, () => {
      for (const typeName of ["UnityEngine.UI.InputField", "TMPro.TMP_InputField"]) try {
        const fields = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls(typeName).type.object);
        for (let i = 0; i < fields.length; i++) {
          const field = fields.get(i), go = call(field, "get_gameObject");
          if (!Boolean(call(go, "get_activeInHierarchy"))) continue;
          const name = String(call(go, "get_name")?.content || "");
          if (!/user[_ ]?name|account[_ ]?name|email/i.test(name)) continue;
          if (!String(call(field, "get_text")?.content || "")) call(field, "set_text", Il2Cpp.string(username));
        }
      } catch (_) {
      }
    });
  }
  section("auto login", () => {
    const credentials = cls(img, "SparkleServices.UsernameAndPassword");
    const useRemembered = (callback, saved, failed) => {
      const retained = new Il2Cpp.Object(callback?.handle ?? callback).ref(false);
      autoLoginTried = true;
      log(`auto login as ${saved.username}`);
      schedule(0, () => {
        try {
          const value = credentials.alloc();
          value.field("username").value = Il2Cpp.string(saved.username);
          value.field("password").value = Il2Cpp.string(saved.password);
          retained.target.method("Invoke").invoke(value.unbox());
        } catch (e) {
          log(`auto login callback failed: ${e}`);
          failed();
        } finally {
          retained.free();
        }
      });
    };
    const mobile = cls(img, "LoginHandler").method("OnLogin", 3);
    const mobileOriginal = new NativeFunction(
      mobile.virtualAddress,
      "void",
      ["pointer", "pointer", "pointer", "pointer"]
    );
    mobile.implementation = function(title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginTried || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginTried) {
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
        prefillLoginUsername(stored?.username || "");
      }
    };
    const fallback = cls(img, "SparkleServices.DefaultLoginHandler").method("LoginHandler", 3);
    const fallbackOriginal = new NativeFunction(
      fallback.virtualAddress,
      "void",
      ["pointer", "pointer", "pointer"]
    );
    fallback.implementation = function(title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginTried || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginTried) {
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
        prefillLoginUsername(stored?.username || "");
      }
    };
  });
  section("tesl reborn credits", () => {
    const credits = cls(img, "CreditsLoader");
    const lineData = cls(img, "CreditsWin").nested("LineDisplayData");
    hookAttach(credits.method("LoadCreditsForDisplay").virtualAddress, {
      onEnter(args) {
        try {
          const list = new Il2Cpp.Object(args[0]);
          for (const [type, text] of [
            [CREDIT_GROUP, "TESL Reborn Team"],
            [CREDIT_TITLE, "Android port \xB7 build 27 \xB7 archive installer"],
            [CREDIT_TITLE, "Project Lead"],
            [CREDIT_NAME, "Renian"],
            [CREDIT_TITLE, "Game Server Developer"],
            [CREDIT_NAME, "Martin Butlak (maker83)"],
            [CREDIT_NAME, "Renian"],
            [CREDIT_TITLE, "Game Client Patches & Mods"],
            [CREDIT_NAME, "Martin Butlak (maker83)"],
            [CREDIT_TITLE, "Tester/Contributor"],
            [CREDIT_NAME, "Vidi_Aquam"]
          ]) {
            const line = newWith(lineData, type, Il2Cpp.string(text));
            list.method("Add").invoke(line);
          }
          log("credits: added the TESL Reborn team");
        } catch (e) {
          log(`credits failed: ${e}`);
        }
      }
    });
  });
  section("legendary title banner", () => {
    hookAttach(cls(img, "UIResourceManager").method("GetTitleBannerSprite").virtualAddress, {
      onEnter(args) {
        if (args[1].toInt32() !== RARITY_LEGENDARY) return;
        args[1] = ptr(0);
        log("UIResourceManager: legendary title banner -> common");
      }
    });
  });
  function revealLegendaryTitleFilter(self) {
    try {
      const root = call(self, "get_transform");
      if (isNull(root)) return;
      const queue = [{ transform: root, path: "", depth: 0 }];
      let found = 0, visited = 0;
      const filterPaths = [];
      while (queue.length && visited++ < 512) {
        const node = queue.shift();
        const name = String(call(node.transform, "get_name")?.content || "");
        const path = `${node.path}/${name}`;
        if (/filter/i.test(name) && filterPaths.length < 12) filterPaths.push(path);
        if (/legendary/i.test(name) && /filter/i.test(path)) {
          call(call(node.transform, "get_gameObject"), "SetActive", true);
          found++;
        }
        if (node.depth >= 12) continue;
        const count = Math.min(100, Number(call(node.transform, "get_childCount")));
        for (let i = 0; i < count; i++) queue.push({ transform: call(node.transform, "GetChild", i), path, depth: node.depth + 1 });
      }
      if (found) log(`titles UI: revealed ${found} legendary filter(s)`);
      else log(`titles UI: legendary filter not found; filter nodes=${filterPaths.join(" | ") || "none"}`);
    } catch (error) {
      log(`titles UI: filter failed: ${error}`);
    }
  }
  section("player profile titles (legendary filter)", () => {
    const ppt = cls(img, "PlayerProfileTitles");
    const hooks = ppt.methods.filter((m) => ["Awake", "OnEnable"].includes(m.name) && !m.isStatic && m.parameterCount === 0);
    if (!hooks.length) throw Error("No own Awake/OnEnable method on PlayerProfileTitles");
    for (const method of hooks) {
      if (method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
        },
        // Fields and mobile UI bindings must already have been initialized.
        onLeave() {
          try {
            revealLegendaryTitleFilter(new Il2Cpp.Object(this.self));
          } catch (error) {
            log(`titles UI: ${error}`);
          }
        }
      });
    }
  });
  const legendaryTitleRows = /* @__PURE__ */ new Map();
  function titleListColour(self) {
    const key = self.handle.toString();
    const data = self.field("_titleData").value;
    if (isNull(data)) return;
    const legendary = enumVal(data.field("Rarity").value) === RARITY_LEGENDARY;
    const previous = legendaryTitleRows.get(key);
    if (!legendary) {
      if (previous) {
        previous.row.free();
        previous.image.free();
        legendaryTitleRows.delete(key);
      }
      return;
    }
    const image = self.field("BackgroundImage").value;
    if (isNull(image)) return;
    const resources = call(ucls("UIResourceManager"), "get_Instance");
    if (!isNull(resources)) {
      const sprite = resources.method("GetTitleBannerSprite", 1).invoke(enumBox(cls(img, "SPTESL.CardRarity"), 0));
      if (!isNull(sprite)) call(image, "set_overrideSprite", sprite);
    }
    call(image, "set_color", rgba(1, 0.75, 0, 1));
    if (!previous) {
      legendaryTitleRows.set(key, { row: self.weakRef(false), image: image.weakRef(false), repairs: 0, warned: false });
      const transform = call(image, "get_transform");
      log(`titles UI: list tint target=${String(call(transform, "get_name")?.content || "?")}`);
      uiLogTree(call(self, "get_transform"), "titles UI list paths");
    }
  }
  function maintainTitleListColours() {
    for (const [key, record] of legendaryTitleRows) {
      try {
        const row = record.row.target, image = record.image.target;
        if (!unityAlive(row) || !unityAlive(image)) {
          record.row.free();
          record.image.free();
          legendaryTitleRows.delete(key);
          continue;
        }
        const data = row.field("_titleData").value;
        if (isNull(data) || enumVal(data.field("Rarity").value) !== RARITY_LEGENDARY) {
          record.row.free();
          record.image.free();
          legendaryTitleRows.delete(key);
          continue;
        }
        if (!Boolean(call(call(image, "get_gameObject"), "get_activeInHierarchy"))) continue;
        const colour = call(image, "get_color");
        if (Math.abs(Number(colour.field("r").value) - 1) > 0.01 || Math.abs(Number(colour.field("g").value) - 0.75) > 0.01 || Math.abs(Number(colour.field("b").value)) > 0.01 || Number(colour.field("a").value) < 0.99) {
          call(image, "set_color", rgba(1, 0.75, 0, 1));
          if (record.repairs++ < 2) log("titles UI: list tint restored after native UI reset");
        }
      } catch (error) {
        if (!record.warned) {
          record.warned = true;
          log(`titles UI: list maintenance failed: ${error}`);
        }
        record.row.free();
        record.image.free();
        legendaryTitleRows.delete(key);
      }
    }
  }
  section("player profile title item (legendary colour)", () => {
    const klass = cls(img, "PlayerProfileTitleItem");
    const methods = klass.methods.filter((m) => ["UpdateUi", "SetData"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull());
    if (!methods.length) throw Error("Title item callbacks not found");
    const attached = /* @__PURE__ */ new Set();
    for (const method of methods) {
      const key = method.virtualAddress.toString();
      if (attached.has(key)) continue;
      attached.add(key);
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
        },
        onLeave() {
          try {
            titleListColour(new Il2Cpp.Object(this.self));
          } catch (error) {
            log(`titles UI: list tint failed: ${error}`);
          }
        }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      hookAttach(render.virtualAddress, { onEnter() {
        maintainTitleListColours();
      } });
      log("titles UI: list colour guard uses Canvas render callback");
    } else {
      const tick = () => {
        maintainTitleListColours();
        schedule(100, tick, "title colours");
      };
      schedule(100, tick, "title colours");
      log("titles UI: list colour guard uses main-thread scheduler");
    }
  });
  section("player info panel (legendary title banner)", () => {
    const pip = cls(img, "PlayerInfoPanel");
    hookAttach(pip.method("UpdateUi").virtualAddress, {
      onEnter(args) {
        this.self = args[0];
      },
      onLeave() {
        try {
          const self = new Il2Cpp.Object(this.self);
          const banners = self.field("_titleBanners").value;
          if (isNull(banners)) return;
          let matchPlayerData = null;
          try {
            matchPlayerData = self.field("_matchPlayerData").value;
          } catch (_) {
          }
          if (isNull(matchPlayerData)) return;
          const titleName = String(matchPlayerData.field("Title").value?.content ?? "");
          if (!titleName) return;
          const gm = cls(img, "SPTESL.GameManager").method("get_Instance").invoke();
          if (isNull(gm)) return;
          const titles = gm.field("Config").value?.field("Titles").value;
          if (isNull(titles)) return;
          let found = null;
          const count = Number(titles.method("get_Count").invoke());
          for (let i = 0; i < count; i++) {
            const t = titles.method("get_Item", 1).invoke(i);
            if (isNull(t)) continue;
            const name = t.field("ResourceId").value.field("UniqueName").value?.content;
            if (name === titleName) {
              found = t;
              break;
            }
          }
          if (isNull(found)) return;
          const rarity = enumVal(found.field("Rarity").value);
          if (rarity !== RARITY_LEGENDARY) return;
          log(`PlayerInfoPanel: legendary title ${titleName}`);
          try {
            const legendaryBanner = banners.get(RARITY_LEGENDARY);
            if (!isNull(legendaryBanner)) {
              const go = call(legendaryBanner, "get_gameObject");
              if (!isNull(go)) go.method("SetActive").invoke(false);
            }
          } catch (_) {
          }
          const commonBanner = banners.get(0);
          if (!isNull(commonBanner)) {
            const go = call(commonBanner, "get_gameObject");
            if (!isNull(go)) go.method("SetActive").invoke(true);
            commonBanner.method("set_color").invoke(rgba(1, 0.75, 0, 1));
          }
        } catch (e) {
          log(`player info panel update failed: ${e}`);
        }
      }
    });
  });
  function rebornStoreImagePath(value) {
    return typeof value === "string" && /^AppBase\/UI\/Textures\/Store\/img_-?\d+_2$/.test(value);
  }
  section("Reborn store image loading", () => {
    const owner = cls(img, "StoreImageUtils");
    const iterator = img.classes.find((c) => c.declaringClass?.name === owner.name && /LoadStoreImageCoroutine/.test(c.name) && c.fields.some((f) => f.name === "imageUrl") && c.fields.some((f) => f.name === "callback"));
    if (!iterator) throw Error("Store image coroutine metadata unavailable");
    const state = iterator.fields.find((f) => f.name === "$PC"), current = iterator.fields.find((f) => f.name === "$current");
    const operation = iterator.fields.find((f) => /operation/i.test(f.name) && /AssetBundleLoadAssetOperation$/.test(f.type.name));
    const sprite = ucls("UnityEngine.Sprite"), catalog = cls(img, "AssetCatalog");
    const load = catalog.method("LoadAssetFromPathAsync").overload("System.String", "System.Type", "System.String");
    const move = iterator.method("MoveNext", 0);
    if (!state || !current || !operation || move.virtualAddress.isNull()) throw Error("Store image coroutine fields unavailable");
    function report(kind, path) {
      recordResourceEvent(kind, path);
      log(`store image: ${kind} ${path}`);
    }
    const jobs = /* @__PURE__ */ new Map();
    function finish(job) {
      if (jobs.get(job.key) !== job) return;
      jobs.delete(job.key);
      try {
        const self = job.ref.target;
        self.field(state.name).value = -1;
        self.field(current.name).value = ptr(0);
        self.field(operation.name).value = ptr(0);
      } catch (_) {
      }
      job.ref.free();
    }
    function poll(job) {
      if (jobs.get(job.key) !== job) return;
      try {
        const self = job.ref.target;
        if (!job.started) {
          job.started = true;
          report("store-request", job.path);
          const result = catalog.method("get_Instance", 0).invoke().method(load.name).overload("System.String", "System.Type", "System.String").invoke(Il2Cpp.string(job.path), sprite.type.object, Il2Cpp.string("png"));
          if (isNull(result)) {
            report("store-missing", job.path);
            finish(job);
            return;
          }
          self.field(operation.name).value = result;
        }
        const op = self.field(operation.name).value;
        if (call(op, "IsDone")) {
          const asset = op.method("GetAsset", 0).inflate(sprite).invoke();
          self.field(state.name).value = -1;
          if (isNull(asset)) report("store-missing", job.path);
          else {
            report("store-loaded", job.path);
            const callback = self.field("callback").value;
            if (!isNull(callback)) invokeDelegatePtr(callback, asset.handle);
          }
          finish(job);
          return;
        }
        if (Date.now() > job.deadline) {
          report("store-timeout", job.path);
          finish(job);
          return;
        }
        schedule(50, () => poll(job), "store image poll");
      } catch (error) {
        report("store-error", job.path);
        log(`store image failure: ${error}`);
        finish(job);
      }
    }
    const factory = owner.methods.find((m) => m.name === "LoadStoreImageCoroutine" && m.isStatic && m.parameterCount === 4);
    if (!factory || factory.virtualAddress.isNull()) throw Error("Store image factory unavailable");
    hookAttach(factory.virtualAddress, { onLeave(ret) {
      if (ret.isNull()) return;
      try {
        const self = new Il2Cpp.Object(ret), path = String(self.field("imageUrl").value?.content || "");
        if (!rebornStoreImagePath(path)) return;
        self.field(state.name).value = -1;
        self.field(current.name).value = ptr(0);
        if (jobs.size >= 64) {
          report("store-busy", path);
          return;
        }
        const key = self.handle.toString();
        if (jobs.has(key)) return;
        const job = { key, ref: self.ref(false), path, deadline: Date.now() + 2e4, started: false };
        jobs.set(key, job);
        report("store-queued", path);
        schedule(0, () => poll(job), "store image poll");
      } catch (error) {
        log(`store image factory failure: ${error}`);
      }
    } });
    log(`store image: direct Sprite/png loading via ${iterator.name}`);
  });
  section("localization asset trace", () => {
    const catalog = cls(img, "AssetCatalog");
    let lastEnterPath = "", lastLoggedPath = "", lastLoggedAt = 0;
    for (const m of catalog.methods.filter((x) => x.name === "LoadAssetFromPathAsync")) {
      hookAttach(m.virtualAddress, {
        onEnter(args) {
          this.path = rawStr(args[1]);
          if (this.path !== lastEnterPath) {
            lastEnterPath = this.path;
            const probe = globalThis.__teslRebornStallProbe;
            if (probe) probe.loads++;
          }
          const selected = /\/Localization\/(?:Text|Audio)\//i.test(this.path) ? resourceLanguage() : "";
          const next = localizedAssetPath(this.path, selected);
          if (next !== this.path) {
            this.replacement = Il2Cpp.string(next).object.ref(false);
            args[1] = this.replacement.target.handle;
            this.path = next;
          }
          recordResourceEvent("asset-request", this.path);
        },
        onLeave(ret) {
          if (this.replacement) this.replacement.free();
          recordResourceEvent(ret.isNull() ? "asset-null" : "asset-operation", this.path);
          const path = this.path ?? "";
          if (path.toLowerCase().indexOf("localization") < 0 && !ret.isNull()) return;
          if (path === lastLoggedPath && Date.now() - lastLoggedAt < 100) return;
          lastLoggedPath = path;
          lastLoggedAt = Date.now();
          log(`LoadAssetFromPathAsync("${path}") -> ${ret.isNull() ? "NULL (not in the asset map)" : "ok"}`);
        }
      });
    }
  });
  section("bundle hash report", () => {
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const catalog = cls(img, "AssetCatalog");
    const target = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-bundle-hashes.txt";
    let written = false, attempts = 0, last = 0;
    hookAttach(catalog.method("SetCacheExpiration").virtualAddress, {
      onEnter() {
        const now = Date.now();
        if (written || attempts >= 3 || attempts > 0 && now - last < 6e4) return;
        last = now;
        attempts++;
        const started = now;
        try {
          const manifest = mgr.field("m_AssetBundleManifest").value;
          if (isNull(manifest)) {
            log("bundle hashes: the manifest is not loaded yet");
            return;
          }
          const names = manifest.method("GetAllAssetBundles").invoke();
          const lines = [];
          for (let i = 0; i < names.length; i++) {
            const name = names.get(i)?.content ?? "";
            const hash = manifest.method("GetAssetBundleHash").invoke(Il2Cpp.string(name));
            const hex = String(hash?.method("ToString").invoke()?.content ?? "");
            lines.push(`${name} ${hex}`);
          }
          Il2Cpp.corlib.class("System.IO.File").method("WriteAllText").invoke(Il2Cpp.string(target), Il2Cpp.string(lines.join("\n")));
          written = true;
          log(`bundle hashes: wrote ${lines.length} entries to ${target} in ${Date.now() - started}ms`);
        } catch (e) {
          log(`bundle hash report failed: ${e}`);
        }
      }
    });
  });
  function uiComponent(go, type) {
    return go.method("GetComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiAdd(go, type) {
    return go.method("AddComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiNew(name, parent) {
    const go = newWith(
      ucls("UnityEngine.GameObject"),
      Il2Cpp.string(name),
      Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object])
    );
    const root = go.ref(false);
    try {
      call(go, "set_layer", Number(call(call(parent, "get_gameObject"), "get_layer")));
      call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(parent, false);
      return go;
    } finally {
      root.free();
    }
  }
  function uiRect(go) {
    return uiComponent(go, "UnityEngine.RectTransform");
  }
  function uiPlace(go, ax, ay, px, py, x, y, width, height) {
    const rect = uiRect(go);
    call(rect, "set_anchorMin", vec2(ax, ay));
    call(rect, "set_anchorMax", vec2(ax, ay));
    call(rect, "set_pivot", vec2(px, py));
    call(rect, "set_anchoredPosition", vec2(x, y));
    call(rect, "set_sizeDelta", vec2(width, height));
    return rect;
  }
  function uiStretch(rect) {
    call(rect, "set_anchorMin", vec2(0, 0));
    call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_offsetMin", vec2(0, 0));
    call(rect, "set_offsetMax", vec2(0, 0));
  }
  function uiXY(value) {
    return { x: Number(value.field("x").value), y: Number(value.field("y").value) };
  }
  function uiEnum(type, field) {
    const c = ucls(type);
    return enumBox(c, enumVal(c.field(field).value));
  }
  function uiList(type) {
    const klass = Il2Cpp.corlib.class("System.Collections.Generic.List`1").inflate(type);
    const list = klass.alloc();
    list.method(".ctor").overload().invoke();
    return list;
  }
  function uiPlain(text) {
    return String(text).replace(/</g, "\u2039").replace(/>/g, "\u203A");
  }
  function uiLogTree(root, prefix) {
    const queue = [{ node: root, path: "", depth: 0 }];
    let visited = 0, line = "";
    while (queue.length && visited++ < 140) {
      const item = queue.shift();
      const path = `${item.path}/${String(call(item.node, "get_name")?.content || "")}`;
      if (line.length + path.length > 700) {
        log(`${prefix}: ${line}`);
        line = "";
      }
      line += `${path} | `;
      if (item.depth >= 6) continue;
      for (let i = 0, count = Math.min(80, Number(call(item.node, "get_childCount"))); i < count; i++)
        queue.push({ node: call(item.node, "GetChild", i), path, depth: item.depth + 1 });
    }
    if (line) log(`${prefix}: ${line}`);
  }
  let uiFontHandle = null;
  function uiFont() {
    if (uiFontHandle) return uiFontHandle.target;
    const objects = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("TMPro.TextMeshProUGUI").type.object);
    const root = objects.object.ref(false);
    try {
      let fallback = null;
      for (let i = 0; i < objects.length; i++) {
        const font = call(objects.get(i), "get_font");
        if (isNull(font)) continue;
        fallback = fallback || font;
        try {
          if (/Merriweather/i.test(String(call(font, "get_name")?.content))) {
            fallback = font;
            break;
          }
        } catch (_) {
        }
      }
      if (!fallback) fallback = ucls("TMPro.TMP_FontAsset").method("get_defaultFontAsset").invoke();
      if (isNull(fallback)) throw Error("No loaded TMP font");
      uiFontHandle = fallback.ref(false);
      return fallback;
    } finally {
      root.free();
    }
  }
  function uiText(go, text, size = 20) {
    const label = uiAdd(go, "TMPro.TextMeshProUGUI"), root = label.ref(false);
    try {
      call(label, "set_font", uiFont());
      call(label, "set_fontSize", size);
      call(label, "set_enableAutoSizing", false);
      call(label, "set_raycastTarget", false);
      call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "Center"));
      call(label, "set_color", rgba(1, 1, 1, 1));
      call(label, "set_text", Il2Cpp.string(text));
      return label;
    } finally {
      root.free();
    }
  }
  function uiButton(go, graphic, action) {
    const button = uiAdd(go, "UnityEngine.UI.Button");
    call(button, "set_targetGraphic", graphic);
    const callback = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
      try {
        action();
      } catch (error) {
        log(`UI button failed: ${error}`);
      }
    });
    call(call(button, "get_onClick"), "AddListener", callback);
    return button;
  }
  function uiLabeledButton(name, parent, text, x, y, width, action) {
    const go = uiNew(name, parent);
    uiPlace(go, 1, 1, 1, 1, x, y, width, 28);
    const bg = uiAdd(go, "UnityEngine.UI.Image");
    call(bg, "set_color", rgba(0.12, 0.12, 0.12, 0.96));
    const labelGO = uiNew("Label", call(go, "get_transform"));
    uiStretch(uiRect(labelGO));
    uiText(labelGO, text, 18);
    uiButton(go, bg, action);
    return go;
  }
  section("native localized language state", () => {
    const localization = cls(img, "LocalizationManager"), set = localization.method("SetLanguage", 2);
    const type = set.parameters[0].type;
    let pending2 = false, nextCheck = 0, attempts = 0, lastChoice = "", lastError = "";
    const resolved = /* @__PURE__ */ new Map();
    function codeOf(name) {
      const raw = String(name || "").toLowerCase().replace(/[^a-zа-яё]/g, "").replace(/^(localizedlanguage|language|locale)/, "");
      const aliases = {
        en_us: ["en", "enus", "engb", "english", "englishus", "englishuk", "englishunitedstates"],
        de_de: ["de", "dede", "german", "deutsch"],
        es_es: ["es", "eses", "spanish", "spanishspain"],
        es_mx: ["esmx", "spanishmexico", "mexicanspanish", "spanishlatinamerica", "latinamericanspanish"],
        fr_fr: ["fr", "frfr", "french", "fran\xE7ais"],
        it_it: ["it", "itit", "italian", "italiano"],
        pl_pl: ["pl", "plpl", "polish", "polski"],
        pt_br: ["pt", "ptbr", "portuguese", "portuguesebrazil", "brazilianportuguese"],
        ru_ru: ["ru", "ruru", "russian", "russianru", "\u0440\u0443\u0441\u0441\u043A\u0438\u0439"],
        tr_tr: ["tr", "trtr", "turkish", "t\xFCrk\xE7e"]
      };
      return Object.keys(aliases).find((code) => aliases[code].includes(raw)) || languageLabel(name);
    }
    function objectCode(object) {
      if (isNull(object)) return;
      for (const field of object.class.fields.filter((f) => !f.isStatic && f.type.name === "System.String" && /code|name|language/i.test(f.name))) {
        const code = codeOf(object.field(field.name).value?.content);
        if (code) return code;
      }
    }
    function resolve(code, manager = null) {
      if (resolved.has(code)) return resolved.get(code);
      if (type.class.isEnum) {
        const field = type.class.fields.find((f) => f.isStatic && codeOf(f.name) === code);
        if (!field) return null;
        const value = field.value, numeric = enumVal(value);
        if (numeric < 0) return null;
        const entry2 = { raw: ptr(numeric), managed: value, name: field.name };
        resolved.set(code, entry2);
        return entry2;
      }
      if (type.class.isValueType) return null;
      const candidates = [];
      for (const field of type.class.fields.filter((f) => f.isStatic && f.type.name === type.name)) candidates.push(field.value);
      if (manager) for (const field of manager.class.fields.filter((f) => !f.isStatic && f.type.name.includes(type.name))) {
        const value = manager.field(field.name).value;
        if (isNull(value)) continue;
        if (field.type.name === type.name) candidates.push(value);
        else if (field.type.name.endsWith("[]")) {
          for (let i = 0; i < Math.min(value.length, 32); i++) candidates.push(value.get(i));
        } else {
          try {
            for (let i = 0, n = Math.min(32, Number(call(value, "get_Count"))); i < n; i++) candidates.push(call(value, "get_Item", i));
          } catch (_) {
          }
        }
      }
      const object = candidates.find((value) => objectCode(value) === code);
      if (!object) return null;
      const retained = object.ref(false), entry = { raw: retained.target.handle, managed: retained.target, name: code, retained };
      resolved.set(code, entry);
      return entry;
    }
    function pin(method) {
      if (!method || method.virtualAddress.isNull()) return;
      hookAttach(method.virtualAddress, { onEnter(args) {
        try {
          const selected = resourceLanguage(), value = selected && resolve(selected, method === set && !set.isStatic ? new Il2Cpp.Object(args[0]) : null);
          if (value) args[method.isStatic ? 0 : 1] = value.raw;
        } catch (error) {
          log(`language state: ${method.name} argument: ${error}`);
        }
      } });
    }
    pin(set);
    let settings = null;
    try {
      settings = cls(img, "SettingsManager");
      const setter = settings.tryMethod("SetCurrentLanguage", 1);
      if (setter) pin(setter);
    } catch (_) {
    }
    for (const [owner, name] of [[localization, "GetSystemDefaultLanguage"], [settings, "GetCurrentLanguage"]]) {
      try {
        const method = owner?.tryMethod(name, 0);
        if (!method || method.returnType.name !== type.name || method.virtualAddress.isNull()) continue;
        hookAttach(method.virtualAddress, { onLeave(result) {
          try {
            const value = resolve(resourceLanguage());
            if (value) result.replace(value.raw);
          } catch (_) {
          }
        } });
      } catch (_) {
      }
    }
    function check() {
      if (pending2 || Date.now() < nextCheck) return;
      nextCheck = Date.now() + 1500;
      const selected = resourceLanguage();
      if (!selected) return;
      if (selected !== lastChoice) {
        lastChoice = selected;
        attempts = 0;
      }
      try {
        const manager = localization.method("get_Instance", 0).invoke();
        if (isNull(manager)) return;
        const actual = String(call(manager, "get_CurrentLanguageCode")?.content || "");
        if (codeOf(actual) === selected) return;
        const value = resolve(selected, manager);
        if (!value) {
          const error = `Cannot resolve ${type.name} for ${selected}`;
          if (error !== lastError) {
            lastError = error;
            log(`language state: ${error}`);
          }
          return;
        }
        if (attempts >= 3) return;
        pending2 = true;
        attempts++;
        const retained = manager.ref(false);
        schedule(0, () => {
          const previous = globalThis.__teslLanguageSyncing;
          globalThis.__teslLanguageSyncing = true;
          try {
            retained.target.method("SetLanguage", 2).invoke(value.managed, false);
            restoreLocalization(retained.target, selected);
            retained.target.method("UpdateObjects", 0).invoke();
            if (settings) try {
              const current = settings.method("get_Instance", 0).invoke();
              if (!isNull(current)) current.method("SetCurrentLanguage", 1).invoke(value.managed);
            } catch (_) {
            }
            const after = String(call(retained.target, "get_CurrentLanguageCode")?.content || "");
            writeTextFile(`${persistentPath()}/tesl-reborn-language-state.json`, JSON.stringify({ revision: 32, selected, before: actual, after, type: type.name, value: value.name, attempt: attempts }));
            log(`language state: ${actual} -> ${after}; selected ${selected}, ${value.name}`);
          } catch (error) {
            log(`language state: initialization failed: ${error}`);
          } finally {
            globalThis.__teslLanguageSyncing = previous;
            pending2 = false;
            retained.free();
          }
        });
      } catch (error) {
        log(`language state: ${error}`);
      }
    }
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, { onLeave: check });
    schedule(0, check);
  });
  const nativeUiSprites = /* @__PURE__ */ new Map();
  function loadNativeUiSprite(path, image, onLoaded = () => {
  }) {
    const cached = nativeUiSprites.get(path);
    if (cached) try {
      if (!isNull(cached.target)) {
        if (image) {
          call(image, "set_sprite", cached.target);
          call(image, "set_color", rgba(1, 1, 1, 1));
        }
        onLoaded();
        return;
      }
    } catch (_) {
    }
    const retained = image ? image.ref(false) : null, started = Date.now();
    let operation = null;
    function release() {
      if (operation) {
        operation.free();
        operation = null;
      }
      if (retained) retained.free();
    }
    function poll() {
      try {
        if (!operation) {
          const catalog = cls(img, "AssetCatalog").method("get_Instance", 0).invoke();
          const value = catalog.method("LoadAssetFromPathAsync").overload("System.String", "System.Type", "System.String").invoke(Il2Cpp.string(path), ucls("UnityEngine.Sprite").type.object, Il2Cpp.string("png"));
          if (isNull(value)) {
            release();
            return;
          }
          operation = value.ref(false);
        }
        if (call(operation.target, "IsDone")) {
          const sprite = operation.target.method("GetAsset", 0).inflate(ucls("UnityEngine.Sprite")).invoke();
          if (!isNull(sprite)) {
            if (!nativeUiSprites.has(path)) nativeUiSprites.set(path, sprite.ref(false));
            if (retained) {
              call(retained.target, "set_sprite", sprite);
              call(retained.target, "set_color", rgba(1, 1, 1, 1));
            }
            onLoaded();
          }
          release();
          return;
        }
        if (Date.now() - started > 2e4) {
          release();
          return;
        }
        schedule(50, poll);
      } catch (error) {
        log(`native UI sprite: ${path}: ${error}`);
        release();
      }
    }
    schedule(0, poll);
  }
  function uiRetryGate(now, limit = 3) {
    let first = null, next = 0, failures = 0;
    return {
      allow() {
        if (first === null) {
          first = now();
          return false;
        }
        return failures < limit && now() - first >= 500 && now() >= next;
      },
      fail() {
        failures++;
        next = now() + Math.min(5e3, 1e3 * failures);
      },
      success() {
        failures = 0;
        next = 0;
      },
      count() {
        return failures;
      }
    };
  }
  function deckSearchText(go, text, size) {
    const label = uiAdd(go, "UnityEngine.UI.Text"), root = label.ref(false);
    try {
      const font = ucls("UnityEngine.Resources").method("GetBuiltinResource").overload("System.Type", "System.String").invoke(ucls("UnityEngine.Font").type.object, Il2Cpp.string("Arial.ttf"));
      if (isNull(font)) throw Error("Deck search font unavailable");
      call(label, "set_font", font);
      call(label, "set_fontSize", size);
      call(label, "set_resizeTextForBestFit", false);
      call(label, "set_alignment", uiEnum("UnityEngine.TextAnchor", "MiddleLeft"));
      call(label, "set_supportRichText", false);
      call(label, "set_color", rgba(1, 1, 1, 1));
      call(label, "set_raycastTarget", false);
      call(label, "set_text", Il2Cpp.string(text));
      return label;
    } finally {
      root.free();
    }
  }
  function deckSearchInput(go, label, image) {
    const input = uiAdd(go, "UnityEngine.UI.InputField"), root = input.ref(false);
    try {
      call(input, "set_textComponent", label);
      call(input, "set_targetGraphic", image);
      call(input, "set_lineType", enumBox(input.method("set_lineType", 1).parameters[0].type.class, 0));
      call(input, "set_characterLimit", 100);
      return input;
    } finally {
      root.free();
    }
  }
  function styleLikeGameInput(ours, label, hint) {
    const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.InputField").type.object);
    for (let i = 0; i < values.length; i++) {
      const game = values.get(i);
      if (!unityAlive(game) || game.handle.equals(ours.handle)) continue;
      const text = call(game, "get_textComponent");
      if (!unityAlive(text) || isNull(call(text, "get_font"))) continue;
      call(label, "set_font", call(text, "get_font"));
      call(label, "set_fontStyle", call(text, "get_fontStyle"));
      call(label, "set_color", call(text, "get_color"));
      const placeholder = call(game, "get_placeholder");
      if (hint && unityAlive(placeholder) && placeholder.class.type.name === "UnityEngine.UI.Text") {
        call(hint, "set_font", call(placeholder, "get_font"));
        call(hint, "set_fontStyle", call(placeholder, "get_fontStyle"));
        call(hint, "set_color", call(placeholder, "get_color"));
      } else if (hint) call(hint, "set_font", call(text, "get_font"));
      return String(call(call(game, "get_gameObject"), "get_name")?.content || "InputField");
    }
    return null;
  }
  function deckSearchMatches(name, query) {
    const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/<[^>]*>/g, "").trim();
    return normalize(name).includes(normalize(query));
  }
  let deckSearchStyleLogged = false;
  section("mobile deck picker search", () => {
    const picker = cls(img, "DeckPickerWin"), tile = cls(img, "DeckTile"), records = /* @__PURE__ */ new Map(), retries = /* @__PURE__ */ new Map();
    const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    let next = 0;
    function cleanup(record) {
      for (const ref of record.hidden.values()) {
        try {
          call(ref.target, "SetActive", true);
        } catch (_) {
        }
        ref.free();
      }
      try {
        call(record.grid.target, "set_offsetMax", vec2(record.offset.x, record.offset.y));
        ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(record.bar.target);
      } catch (_) {
      }
      for (const name of ["self", "input", "bar", "grid"]) record[name].free();
    }
    function install(self) {
      const roots = [];
      let bar = null, gridRect = null, offset = null, committed = false, phase = "root";
      const hold = (value) => {
        if (!isNull(value)) roots.push(value.ref(false));
        return value;
      };
      const create = (...args) => hold(uiNew(...args));
      try {
        hold(self);
        const go = hold(call(self, "get_gameObject")), parent = hold(call(go, "get_transform")), grid = hold(self.field("_grid").value);
        if (isNull(grid)) throw Error("Deck grid not initialized");
        gridRect = hold(call(grid, "get_transform"));
        try {
          const scroll = grid.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.UI.ScrollRect").type.object);
          if (!isNull(scroll)) {
            const viewport2 = call(scroll, "get_viewport");
            if (!isNull(viewport2)) gridRect = hold(viewport2);
          }
        } catch (_) {
        }
        const old = call(gridRect, "get_offsetMax");
        offset = { x: Number(old.field("x").value), y: Number(old.field("y").value) };
        const stale = call(parent, "Find", Il2Cpp.string("RebornDeckSearch"));
        if (!isNull(stale)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(stale, "get_gameObject"));
        phase = "create bar";
        bar = create("RebornDeckSearch", parent);
        call(bar, "SetActive", false);
        uiPlace(bar, 0.5, 1, 0.5, 1, 0, -6, 760, 68);
        const image = hold(uiAdd(bar, "UnityEngine.UI.Image"));
        call(image, "set_color", rgba(0.08, 0.08, 0.08, 0.96));
        loadNativeUiSprite("AppBase/UI/Sprites/Core/UtilityAssets/input-frame", image, () => {
          call(image, "set_type", enumBox(image.method("set_type", 1).parameters[0].type.class, 1));
        });
        const viewport = create("TextViewport", call(bar, "get_transform"));
        uiStretch(uiRect(viewport));
        call(uiRect(viewport), "set_offsetMin", vec2(18, 6));
        call(uiRect(viewport), "set_offsetMax", vec2(-96, -6));
        const textGO = create("Text", call(viewport, "get_transform"));
        uiStretch(uiRect(textGO));
        phase = "text/input";
        const label = hold(deckSearchText(textGO, "", 32)), input = hold(deckSearchInput(bar, label, image));
        const placeholderGO = create("Placeholder", call(viewport, "get_transform"));
        uiStretch(uiRect(placeholderGO));
        const labels = { en_us: "Search decks\u2026", ru_ru: "\u041F\u043E\u0438\u0441\u043A \u043A\u043E\u043B\u043E\u0434\u2026", de_de: "Decks suchen\u2026", es_es: "Buscar mazos\u2026", es_mx: "Buscar mazos\u2026", fr_fr: "Rechercher un deck\u2026", it_it: "Cerca mazzi\u2026", pl_pl: "Szukaj talii\u2026", pt_br: "Buscar decks\u2026", tr_tr: "Deste ara\u2026" };
        phase = "placeholder";
        const hint = hold(deckSearchText(placeholderGO, labels[resourceLanguage()] || labels.en_us, 30));
        call(hint, "set_color", rgba(0.65, 0.65, 0.65, 1));
        call(input, "set_placeholder", hint);
        phase = "game font";
        try {
          const source = styleLikeGameInput(input, label, hint);
          if (source && !deckSearchStyleLogged) {
            deckSearchStyleLogged = true;
            log(`deck search: text styled like the game's ${source}`);
          }
        } catch (error) {
          log(`deck search: kept the built-in font: ${error}`);
        }
        phase = "clear button";
        const clear = uiLabeledButton("Clear", call(bar, "get_transform"), "X", -8, -8, 100, () => {
          call(input, "set_text", Il2Cpp.string(""));
        });
        uiPlace(clear, 1, 0.5, 1, 0.5, -8, 0, 76, 56);
        const clearText = call(call(clear, "get_transform"), "Find", Il2Cpp.string("Label"));
        if (!isNull(clearText)) call(uiComponent(call(clearText, "get_gameObject"), "TMPro.TextMeshProUGUI"), "set_fontSize", 32);
        loadNativeUiSprite("AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon", uiComponent(clear, "UnityEngine.UI.Image"), () => {
          if (!isNull(clearText)) call(call(clearText, "get_gameObject"), "SetActive", false);
        });
        call(gridRect, "set_offsetMax", vec2(offset.x, offset.y - 82));
        call(bar, "SetActive", true);
        const record = { self: self.ref(false), input: input.ref(false), bar: bar.ref(false), grid: gridRect.ref(false), offset, hidden: /* @__PURE__ */ new Map() };
        committed = true;
        return record;
      } catch (error) {
        throw Error(`${phase}: ${error}`);
      } finally {
        if (!committed) {
          if (offset && gridRect) try {
            call(gridRect, "set_offsetMax", vec2(offset.x, offset.y));
          } catch (_) {
          }
          if (bar) try {
            ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(bar);
          } catch (_) {
          }
        }
        for (const root of roots.reverse()) root.free();
      }
    }
    function scanPicker(self, go, immediate) {
      const key = self.handle.toString();
      let record = records.get(key);
      if (!record) {
        let gate = retries.get(key);
        if (!gate) {
          gate = uiRetryGate(() => Date.now());
          retries.set(key, gate);
        }
        if (!immediate && !gate.allow()) return key;
        try {
          record = install(self);
          records.set(key, record);
          gate.success();
          log(`deck search: installed${immediate ? " with the deck list" : ""}`);
        } catch (error) {
          gate.fail();
          log(`deck search: initialization attempt ${gate.count()}/3: ${error}`);
          return key;
        }
      }
      const query = String(call(record.input.target, "get_text")?.content || "");
      if (!query && !record.hidden.size) {
        record.lastQuery = "";
        return key;
      }
      const tiles = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(tile.type.object, true), tilesRoot = tiles.object.ref(false);
      try {
        if (query === record.lastQuery && tiles.length === record.lastCount) return key;
        for (let j = 0; j < tiles.length; j++) {
          const item = tiles.get(j), child = call(item, "get_gameObject"), id = child.handle.toString();
          if (!call(child, "get_activeSelf") && !record.hidden.has(id)) continue;
          const name = String(call(item.field("DeckNameText").value, "get_text")?.content || "");
          const show = deckSearchMatches(name, query), hidden = record.hidden.get(id);
          if (!show && !hidden) {
            record.hidden.set(id, child.ref(false));
            call(child, "SetActive", false);
          } else if (show && hidden) {
            call(child, "SetActive", true);
            hidden.free();
            record.hidden.delete(id);
          }
        }
        record.lastQuery = query;
        record.lastCount = tiles.length;
      } finally {
        tilesRoot.free();
      }
      return key;
    }
    const updateUi = picker.tryMethod("UpdateUi", 0);
    if (updateUi && !updateUi.virtualAddress.isNull()) hookAttach(updateUi.virtualAddress, { onEnter(args) {
      this.self = args[0];
    }, onLeave() {
      const ref = new Il2Cpp.Object(this.self).ref(false);
      schedule(0, () => {
        try {
          const go = call(ref.target, "get_gameObject");
          if (call(go, "get_activeInHierarchy")) {
            const record = records.get(ref.target.handle.toString());
            if (record) record.lastCount = -1;
            scanPicker(ref.target, go, true);
          }
        } catch (error) {
          log(`deck search: ${error}`);
        } finally {
          ref.free();
        }
      }, "deck search install");
    } });
    const preloadAt = Date.now() + 15e3;
    let preloaded = false;
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, { onLeave() {
      if (!preloaded && Date.now() >= preloadAt) {
        preloaded = true;
        for (const path of ["AppBase/UI/Sprites/Core/UtilityAssets/input-frame", "AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon"])
          schedule(0, () => loadNativeUiSprite(path, null), "deck search sprite preload");
      }
      if (Date.now() < next) return;
      next = Date.now() + 250;
      schedule(0, () => {
        const live = /* @__PURE__ */ new Set();
        let scanned = false;
        try {
          const values = find.invoke(picker.type.object), arrayRoot = values.object.ref(false);
          try {
            for (let i = 0; i < values.length; i++) {
              const self = values.get(i), go = call(self, "get_gameObject");
              if (!call(go, "get_activeInHierarchy")) continue;
              live.add(scanPicker(self, go, false));
            }
            scanned = true;
          } finally {
            arrayRoot.free();
          }
        } catch (error) {
          log(`deck search: ${error}`);
        }
        if (scanned) {
          for (const [key, record] of records) if (!live.has(key)) {
            cleanup(record);
            records.delete(key);
          }
          for (const key of retries.keys()) if (!live.has(key)) retries.delete(key);
        }
      }, "deck search scan");
    } });
  });
  section("friends while matchmaking", () => {
    const seeking = cls(img, "MatchSeekingWin"), records = /* @__PURE__ */ new Map();
    const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    const unityObject = ucls("UnityEngine.Object");
    const alive = (value) => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    const firstLive = (type, pick) => {
      const values = find.invoke(type);
      for (let i = 0; i < values.length; i++) {
        const value = pick(values.get(i));
        if (alive(value) && call(call(value, "get_gameObject"), "get_activeInHierarchy")) return value;
      }
      return null;
    };
    const gameFriendsButton = () => firstLive(cls(img, "MainMenuOverlayController").type.object, (c) => {
      const view = call(c, "get__overlayView");
      return alive(view) ? view.field("_friendsBtn").value : null;
    });
    const gameFriendsWindow = () => firstLive(cls(img, "SPTESL.MainMenu").type.object, (m) => m.field("_friendsWin").value);
    const originals = /* @__PURE__ */ new Map();
    const original = (component, read) => {
      const key = component.handle.toString();
      if (!originals.has(key)) originals.set(key, read());
      return originals.get(key);
    };
    function raise(go, order, layer) {
      const canvasType = ucls("UnityEngine.Canvas").type.object, rayType = ucls("UnityEngine.UI.GraphicRaycaster").type.object;
      let canvas = go.method("GetComponent").overload("System.Type").invoke(canvasType), saved;
      if (alive(canvas)) saved = original(canvas, () => ({ override: Boolean(call(canvas, "get_overrideSorting")), order: Number(call(canvas, "get_sortingOrder")), layer: Number(call(canvas, "get_sortingLayerID")) }));
      else {
        canvas = uiAdd(go, "UnityEngine.Canvas");
        saved = original(canvas, () => ({ override: false, order: 0, layer: 0 }));
      }
      let ray = go.method("GetComponent").overload("System.Type").invoke(rayType), rayEnabled;
      if (alive(ray)) rayEnabled = original(ray, () => Boolean(call(ray, "get_enabled")));
      else {
        ray = uiAdd(go, "UnityEngine.UI.GraphicRaycaster");
        rayEnabled = original(ray, () => true);
      }
      const item = { go: go.ref(false), canvas: canvas.ref(false), ray: ray.ref(false), ...saved, rayEnabled };
      call(canvas, "set_overrideSorting", true);
      call(canvas, "set_sortingLayerID", layer);
      call(canvas, "set_sortingOrder", order);
      call(ray, "set_enabled", true);
      return item;
    }
    function lower(item) {
      try {
        if (alive(item.canvas.target)) {
          call(item.canvas.target, "set_sortingLayerID", item.layer);
          call(item.canvas.target, "set_sortingOrder", item.order);
          call(item.canvas.target, "set_overrideSorting", item.override);
        }
        if (alive(item.ray.target)) call(item.ray.target, "set_enabled", item.rayEnabled);
      } finally {
        item.go.free();
        item.canvas.free();
        item.ray.free();
      }
    }
    function restore(record, source) {
      log(`matching friends: lowered (${source}; ${record.items.length} item${record.items.length === 1 ? "" : "s"})`);
      for (const item of record.items) try {
        lower(item);
      } catch (error) {
        log(`matching friends: lower (${source}) failed: ${error}`);
      }
      record.window.free();
    }
    const show = seeking.method("Show");
    hookAttach(show.virtualAddress, { onEnter(args) {
      this.self = args[0];
    }, onLeave() {
      const ref = new Il2Cpp.Object(this.self).ref(false);
      schedule(0, () => {
        let record = null, key = "";
        try {
          const go = call(ref.target, "get_gameObject");
          key = go.handle.toString();
          if (!call(go, "get_activeInHierarchy")) return;
          if (records.has(key)) {
            const stale = records.get(key);
            records.delete(key);
            restore(stale, "search reopened");
          }
          const window = ref.target.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
          if (!alive(window)) throw Error("search window has no Canvas");
          const root = call(window, "get_rootCanvas");
          const order = Math.max(Number(call(window, "get_sortingOrder")), alive(root) ? Number(call(root, "get_sortingOrder")) : 0) + 10, layer = Number(call(window, "get_sortingLayerID"));
          const button = gameFriendsButton();
          if (!button) throw Error("the menu's _friendsBtn is unavailable");
          record = { items: [], window: ref.target.ref(false) };
          record.items.push(raise(call(button, "get_gameObject"), order, layer));
          const friends = gameFriendsWindow();
          if (friends) record.items.push(raise(call(friends, "get_gameObject"), order + 1, layer));
          records.set(key, record);
          armWatch();
          log(`matching friends: raised above the search window (order ${order}${friends ? "" : ", no friends window"})`);
        } catch (error) {
          if (record) {
            records.delete(key);
            restore(record, "show failure rollback");
          }
          log(`matching friends: ${error}`);
        } finally {
          ref.free();
        }
      }, "matching friends show");
    } });
    const closed = [], absent = [];
    for (const name of ["OnDisable", "OnDestroy", "HandleOnCancelSearch"]) {
      const method = seeking.tryMethod(name, 0);
      if (!method || method.virtualAddress.isNull()) {
        absent.push(name);
        continue;
      }
      closed.push(name);
      hookAttach(method.virtualAddress, { onEnter(args) {
        try {
          const key = call(new Il2Cpp.Object(args[0]), "get_gameObject").handle.toString(), record = records.get(key);
          if (record) {
            records.delete(key);
            schedule(0, () => restore(record, name), "matching friends restore");
          }
        } catch (error) {
          log(`matching friends restore: ${error}`);
        }
      } });
    }
    log(`matching friends: close hooks ${closed.join(", ")}${absent.length ? ` (missing ${absent.join(", ")})` : ""}`);
    let watching = false;
    const armWatch = () => {
      if (records.size && !watching) {
        watching = true;
        schedule(1e3, watch, "matching friends watchdog");
      }
    };
    const watch = () => {
      watching = false;
      for (const [key, record] of records) {
        let live = false;
        try {
          live = alive(record.window.target) && call(call(record.window.target, "get_gameObject"), "get_activeInHierarchy");
        } catch (_) {
        }
        if (live) continue;
        records.delete(key);
        restore(record, "watchdog");
      }
      armWatch();
    };
  });
  section("native Settings language selection", () => {
    const owner = img.classes.find((c) => c.name === "LanguageSelectDropdown");
    const handler = owner?.tryMethod("HandleLanguageOnValueChanged", 1);
    if (!handler || handler.virtualAddress.isNull()) return;
    let selecting = 0, selectionHooks = 0;
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) try {
      const method = ucls(name).tryMethod("OnSelectItem", 1);
      if (!method || method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress, { onEnter() {
        selecting++;
      }, onLeave() {
        selecting = Math.max(0, selecting - 1);
      } });
      selectionHooks++;
    } catch (_) {
    }
    if (!selectionHooks) return;
    handler.implementation = function(index) {
      if (!selecting) return handler.invokeRaw(this.handle, index);
      try {
        let dropdown = this;
        try {
          call(dropdown, "get_options");
        } catch (_) {
          const field = this.class.fields.find((f) => !f.isStatic && /^(UnityEngine.UI.Dropdown|TMPro.TMP_Dropdown)$/.test(f.type.name));
          dropdown = field ? this.field(field.name).value : null;
        }
        if (isNull(dropdown)) throw Error("Language dropdown instance unavailable");
        const options = call(dropdown, "get_options"), count = Number(call(options, "get_Count"));
        if (index < 0 || index >= count || count > 32) return;
        const label = String(call(call(options, "get_Item", index), "get_text")?.content || "");
        const code = languageLabel(label);
        if (!code) throw Error("Unknown language label " + JSON.stringify(label.slice(0, 120)));
        if (code === resourceLanguage()) return;
        log(`native language dropdown: selected ${code}`);
        schedule(0, () => ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string(languageSetupUri("language=" + code + "&apply=1"))));
      } catch (error) {
        log(`native language dropdown: ${error}`);
        schedule(0, () => ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string(languageSetupUri("chooseLanguage=1"))));
      }
    };
    globalThis.__teslNativeLanguageCallback = true;
  });
  const closingSettings = /* @__PURE__ */ new Set();
  function settingsWindowKey(self) {
    return (self.class?.type.name === "UnityEngine.GameObject" ? self : call(self, "get_gameObject")).handle.toString();
  }
  function settingsClosing(self, reason) {
    const key = settingsWindowKey(self);
    if (closingSettings.size > 128) closingSettings.clear();
    closingSettings.add(key);
    const root = call(self, "get_transform"), child = call(root, "Find", Il2Cpp.string("RebornGameData"));
    if (resourceSettingsWindow && resourceSettingsWindow.target.handle.toString() === key) {
      resourceSettingsWindow.free();
      resourceSettingsWindow = null;
    }
    log(`settings UI: ${reason}; custom control suspended`);
  }
  function settingsButtonPressed(button) {
    try {
      let node = call(button, "get_transform"), names = [];
      const buttonName = String(call(node, "get_name")?.content || "");
      try {
        const event = call(button, "get_onClick");
        const countMethod = event.tryMethod("GetPersistentEventCount", 0);
        const nameMethod = event.tryMethod("GetPersistentMethodName", 1);
        if (countMethod && nameMethod) {
          const count = Math.min(32, Number(countMethod.invoke()));
          for (let i = 0; i < count; i++) names.push(String(nameMethod.invoke(i)?.content || ""));
        } else {
          const fields = Array.from(event.class.hierarchy()).flatMap((c) => c.fields);
          const groupField = fields.find((f) => !f.isStatic && /PersistentCallGroup$/.test(f.type.name));
          const group = groupField && event.field(groupField.name).value;
          if (!isNull(group)) {
            const listField = group.class.fields.find((f) => !f.isStatic && /List.*PersistentCall/.test(f.type.name));
            const list = listField && group.field(listField.name).value;
            if (!isNull(list)) for (let i = 0, count = Math.min(32, Number(call(list, "get_Count"))); i < count; i++) {
              const entry = call(list, "get_Item", i), field = entry.class.fields.find((f) => !f.isStatic && /methodname/i.test(f.name) && f.type.name === "System.String");
              if (field) names.push(String(entry.field(field.name).value?.content || ""));
            }
          }
        }
      } catch (_) {
      }
      for (let depth = 0; depth < 10 && !isNull(node); depth++, node = call(node, "get_parent")) {
        const name = String(call(node, "get_name")?.content || "");
        if (!/^SettingsWin[_ -]?Mobile(?:\(Clone\))?$/i.test(name) && !/^SettingsWin(?:\(Clone\))?$/i.test(name)) continue;
        const action = [buttonName, ...names].join(" ");
        log(`settings button: ${action.slice(0, 240)}`);
        if (/cancel|close|back|negative|dismiss|\bok\b|confirm|accept/i.test(action)) settingsClosing(call(node, "get_gameObject"), action);
        return;
      }
    } catch (error) {
      log(`settings button trace: ${error}`);
    }
  }
  function installSettingsDataButton(self) {
    if (!fileExists(`${persistentPath()}/tesl-reborn-setup.json`)) return;
    if (closingSettings.has(settingsWindowKey(self))) return;
    const root = call(self, "get_transform");
    const rootName = String(call(root, "get_name")?.content || "");
    const typeName = String(self.class?.name || "");
    const compactName = rootName.replace(/\(Clone\)$/i, "").replace(/[_ -]/g, "");
    if (typeName === "OptionsWin" || /^OptionsWin(?:Mobile)?$/i.test(compactName)) {
      const old = findGameDataButton(root);
      if (!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old, "get_gameObject"));
      return;
    }
    if (typeName !== "SettingsWin" && !/^SettingsWin(?:Mobile)?$/i.test(compactName)) return;
    const window = call(root, "get_gameObject");
    if (resourceSettingsWindow && !resourceSettingsWindow.target.handle.equals(window.handle)) {
      try {
        const previous = call(resourceSettingsWindow.target, "get_transform");
        if (Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy")) && Boolean(call(previous, "IsChildOf", root))) return;
        if (Boolean(call(root, "IsChildOf", previous))) {
          const old = findGameDataButton(previous);
          if (!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old, "get_gameObject"));
        }
      } catch (_) {
      }
    }
    if (!isNull(window) && (!resourceSettingsWindow || !resourceSettingsWindow.target.handle.equals(window.handle))) {
      if (resourceSettingsWindow) resourceSettingsWindow.free();
      resourceSettingsWindow = window.ref(false);
    }
    const existing = findGameDataButton(root);
    if (!isNull(existing)) {
      const go = call(existing, "get_gameObject");
      if (!call(go, "get_activeSelf")) call(go, "SetActive", true);
      return;
    }
    const labels = { en_us: "Game data", de_de: "Spieldaten", es_es: "Datos del juego", es_mx: "Datos del juego", fr_fr: "Donn\xE9es du jeu", it_it: "Dati di gioco", pl_pl: "Dane gry", pt_br: "Dados do jogo", ru_ru: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0433\u0440\u044B", tr_tr: "Oyun verileri" };
    const button = uiLabeledButton("RebornGameData", root, labels[resourceLanguage()] || "Game data", -70, -64, 180, () => {
      ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string("teslreborn://resources"));
    });
    uiPlace(button, 1, 1, 1, 1, -18, -74, 180, 48);
    const layout = uiAdd(button, "UnityEngine.UI.LayoutElement");
    call(layout, "set_ignoreLayout", true);
    try {
      styleAsSettingsTab(self, button, layout);
    } catch (error) {
      log(`settings button: kept the plain Game data button: ${error}`);
    }
  }
  function styleAsSettingsTab(self, button, layout) {
    let step = "tab group";
    try {
      const group = self.field("_tabNavigation").value;
      if (isNull(group)) throw Error("no _tabNavigation");
      const toggles = group.field("_toggles").value;
      if (isNull(toggles) || !toggles.length) throw Error("no settings tabs");
      const first = toggles.get(0), last = toggles.get(toggles.length - 1);
      const firstNode = call(call(first, "get_gameObject"), "get_transform"), lastNode = call(call(last, "get_gameObject"), "get_transform");
      const row = call(lastNode, "get_parent");
      if (isNull(row)) throw Error("settings tab has no row");
      step = "frame";
      const art = call(first, "get_targetGraphic"), image = uiComponent(button, "UnityEngine.UI.Image");
      if (!isNull(art) && art.class.type.name === "UnityEngine.UI.Image" && !isNull(image)) {
        call(image, "set_sprite", call(art, "get_sprite"));
        call(image, "set_type", call(art, "get_type"));
        call(image, "set_color", call(art, "get_color"));
      }
      step = "label";
      const tmp = ucls("TMPro.TextMeshProUGUI").type.object;
      const firstIn = (go) => {
        const all = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(tmp, true);
        return all.length ? all.get(0) : null;
      };
      const tabLabel = firstIn(call(first, "get_gameObject"));
      const label = firstIn(button);
      if (!isNull(tabLabel) && !isNull(label)) {
        call(label, "set_font", call(tabLabel, "get_font"));
        call(label, "set_color", call(tabLabel, "get_color"));
        const copy = (name) => {
          const get = tabLabel.tryMethod("get_" + name, 0), set = label.tryMethod("set_" + name, 1);
          if (get && set) set.invoke(get.invoke());
        };
        for (const name of ["enableAutoSizing", "fontSizeMin", "fontSizeMax", "fontSize"]) copy(name);
      }
      step = "size";
      const bounds = call(lastNode, "get_rect");
      const width = Number(bounds.field("m_Width").value), height = Number(bounds.field("m_Height").value);
      const vec = (value) => ({ x: Number(value.field("x").value), y: Number(value.field("y").value) });
      step = "row";
      const node = call(button, "get_transform");
      node.method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(row, false);
      call(node, "SetAsLastSibling");
      call(node, "set_localScale", call(lastNode, "get_localScale"));
      for (const name of ["anchorMin", "anchorMax", "pivot"]) call(node, "set_" + name, call(lastNode, "get_" + name));
      call(node, "set_sizeDelta", call(lastNode, "get_sizeDelta"));
      call(layout, "set_preferredWidth", width);
      call(layout, "set_preferredHeight", height);
      const flow = uiComponent(call(row, "get_gameObject"), "UnityEngine.UI.HorizontalLayoutGroup");
      if (!isNull(flow)) {
        call(layout, "set_ignoreLayout", false);
        log(`settings button: third tab in the row layout (${Math.round(width)}x${Math.round(height)})`);
        return;
      }
      step = "position";
      const a = vec(call(firstNode, "get_anchoredPosition")), b = vec(call(lastNode, "get_anchoredPosition"));
      const gap = toggles.length > 1 ? (b.x - a.x) / (toggles.length - 1) : width + 16;
      call(node, "set_anchoredPosition", vec2(b.x + gap, b.y));
      const rowPos = vec(call(row, "get_anchoredPosition"));
      call(row, "set_anchoredPosition", vec2(rowPos.x - gap / 2, rowPos.y));
      log(`settings button: third tab at step ${Math.round(gap)} (${Math.round(width)}x${Math.round(height)}), row centred`);
    } catch (error) {
      throw Error(`${step}: ${error}`);
    }
  }
  function layoutGameDataTab(self) {
    const group = self.field("_tabNavigation").value;
    const button = findGameDataButton(call(self, "get_transform"));
    if (isNull(group) || isNull(button)) return null;
    const toggles = group.field("_toggles").value, shown = [];
    for (let i = 0; i < toggles.length; i++) {
      const node = call(call(toggles.get(i), "get_gameObject"), "get_transform");
      if (call(call(node, "get_gameObject"), "get_activeInHierarchy")) shown.push(node);
    }
    if (shown.length < 2) return null;
    const size = call(shown[0], "get_rect"), width = Number(size.field("m_Width").value), height = Number(size.field("m_Height").value);
    if (width > 0 && height > 0) {
      const layout = uiComponent(call(button, "get_gameObject"), "UnityEngine.UI.LayoutElement");
      if (!isNull(layout)) {
        call(layout, "set_preferredWidth", width);
        call(layout, "set_preferredHeight", height);
      }
      call(button, "set_sizeDelta", call(shown[0], "get_sizeDelta"));
    }
    const at = (node) => {
      const p = call(node, "get_position");
      return { x: Number(p.field("x").value), y: Number(p.field("y").value), z: Number(p.field("z").value) };
    };
    const first = at(shown[0]), last = at(shown[shown.length - 1]);
    const gap = (last.x - first.x) / (shown.length - 1);
    call(button, "set_position", unityStruct("UnityEngine.Vector3", { x: last.x + gap, y: last.y, z: last.z }));
    const row = call(shown[0], "get_parent"), centre = at(call(self, "get_transform")).x;
    const shift = centre - (first.x + last.x + gap) / 2, rowAt = at(row);
    if (Math.abs(shift) > 1e-3) call(row, "set_position", unityStruct("UnityEngine.Vector3", { x: rowAt.x + shift, y: rowAt.y, z: rowAt.z }));
    return `${shown.length + 1} tabs, step ${gap.toFixed(3)}`;
  }
  function findGameDataButton(root) {
    const direct = call(root, "Find", Il2Cpp.string("RebornGameData"));
    if (!isNull(direct)) return direct;
    const buttons = call(root, "get_gameObject").method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("UnityEngine.UI.Button").type.object, true);
    for (let i = 0; i < buttons.length; i++) {
      const node = call(buttons.get(i), "get_transform");
      if (String(call(node, "get_name")?.content || "") === "RebornGameData") return node;
    }
    return null;
  }
  section("settings game data", () => {
    const classes = img.classes.filter((c) => /^(?:Game)?(?:Options|Settings)(?:Win|Window|Panel|Dialog)$/.test(c.name)).filter((c) => Array.from(c.hierarchy()).some((base) => base.type.name === "UnityEngine.Component"));
    let hooks = 0;
    for (const owner of classes) for (const method of owner.methods.filter((m) => ["Show", "OnEnable", "Awake", "Start"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
          if (method.name === "Show" || method.name === "OnEnable") {
            try {
              closingSettings.delete(settingsWindowKey(new Il2Cpp.Object(this.self)));
            } catch (_) {
            }
          }
        },
        onLeave() {
          const retained = new Il2Cpp.Object(this.self).ref(false);
          schedule(0, () => {
            try {
              installSettingsDataButton(retained.target);
            } catch (e) {
              log(`settings data: ${e}`);
            } finally {
              retained.free();
            }
          });
        }
      });
      hooks++;
    }
    const closeAddresses = /* @__PURE__ */ new Set();
    for (const owner of classes) for (const method of owner.methods.filter((m) => /^(?:(?:On|Handle)?(?:Cancel|Close|Hide)(?:Button)?(?:Click|Clicked|Pressed)?|OnDisable|OnDestroy)$/i.test(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
      const key = method.virtualAddress.toString();
      if (closeAddresses.has(key)) continue;
      closeAddresses.add(key);
      hookAttach(method.virtualAddress, { onEnter(args) {
        try {
          settingsClosing(new Il2Cpp.Object(args[0]), owner.name + "." + method.name);
        } catch (error) {
          log(`settings UI close trace: ${error}`);
        }
      } });
    }
    let last = 0;
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    if (!hooks) hookAttach(update.virtualAddress, { onLeave() {
      if (Date.now() - last < 1e3) return;
      last = Date.now();
      try {
        const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
        if (classes.length) {
          for (const owner of classes) {
            const windows = find.invoke(owner.type.object);
            for (let i = 0; i < windows.length; i++) {
              const window = windows.get(i);
              if (Boolean(call(call(window, "get_gameObject"), "get_activeInHierarchy"))) installSettingsDataButton(window);
            }
          }
          return;
        }
        const objects = find.invoke(ucls("UnityEngine.UI.Button").type.object), visited = /* @__PURE__ */ new Set();
        for (let i = 0; i < objects.length; i++) {
          const go = call(objects.get(i), "get_gameObject");
          if (!Boolean(call(go, "get_activeInHierarchy"))) continue;
          let node = call(go, "get_transform");
          for (let depth = 0; depth < 8 && !isNull(node); depth++, node = call(node, "get_parent")) {
            const key = node.handle.toString();
            if (visited.has(key)) break;
            visited.add(key);
            if (!/^(?:OptionsWinMobile|SettingsWin_Mobile|SettingsWin|OptionsWin)$/i.test(String(call(node, "get_name")?.content || "").replace(/\(Clone\)$/i, "").trim())) continue;
            const root = call(node, "get_gameObject"), rect = uiRect(root), bounds = call(rect, "get_rect");
            if (Number(bounds.field("m_Width").value) < 300 || Number(bounds.field("m_Height").value) < 200) continue;
            installSettingsDataButton(root);
          }
        }
      } catch (_) {
      }
    } });
    log(`settings game data: ${hooks} window hooks, ${closeAddresses.size} close hooks and prefab fallback`);
  });
  function graphicsFrameRate(text) {
    try {
      const value = JSON.parse(text || "null")?.frameRate;
      return Number.isInteger(value) && value >= 20 && value <= 240 ? value : null;
    } catch (_) {
      return null;
    }
  }
  function graphicsQuality(text) {
    try {
      const value = JSON.parse(text || "null")?.quality;
      return Number.isInteger(value) && value >= 0 && value <= 3 ? value : null;
    } catch (_) {
      return null;
    }
  }
  function graphicsRenderScale(text) {
    try {
      const value = JSON.parse(text || "null")?.renderScale;
      return Number.isInteger(value) && value >= 30 && value < 100 ? value : null;
    } catch (_) {
      return null;
    }
  }
  function scaledResolution(state, width, height, percent) {
    if (width * height > state.width * state.height) {
      state.width = width;
      state.height = height;
    }
    const target = { width: Math.round(state.width * percent / 100), height: Math.round(state.height * percent / 100) };
    return width > target.width ? target : { width, height };
  }
  section("graphics: render resolution", () => {
    const percent = graphicsRenderScale(readTextFile(`${persistentPath()}/tesl-reborn-graphics.json`));
    if (!percent) return;
    const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
    const name = "UnityEngine.Screen::SetResolution(System.Int32,System.Int32,System.Boolean,System.Int32)";
    const at = resolve(Memory.allocUtf8String(name));
    if (at.isNull()) {
      log("graphics: render resolution unavailable (no engine SetResolution)");
      return;
    }
    const state = { width: 0, height: 0 };
    hookAttach(at, {
      onEnter(args) {
        const width = args[0].toInt32(), height = args[1].toInt32();
        const size = scaledResolution(state, width, height, percent);
        if (size.width === width) return;
        args[0] = ptr(size.width);
        args[1] = ptr(size.height);
        log(`graphics: render resolution ${width}x${height} -> ${size.width}x${size.height} (${percent}%)`);
      }
    });
    const setResolution = new NativeFunction(at, "void", ["int", "int", "bool", "int"]);
    schedule(0, () => {
      try {
        const screen = ucls("UnityEngine.Screen");
        const width = Number(screen.method("get_width", 0).invoke()), height = Number(screen.method("get_height", 0).invoke());
        const fullscreen = Boolean(screen.method("get_fullScreen", 0).invoke());
        setResolution(width, height, fullscreen ? 1 : 0, 0);
      } catch (error) {
        log(`graphics: render resolution failed: ${error}`);
      }
    }, "graphics render resolution");
  });
  section("graphics: frame rate and quality", () => {
    const file = `${persistentPath()}/tesl-reborn-graphics.json`;
    const rate = graphicsFrameRate(readTextFile(file));
    let chosenQuality = graphicsQuality(readTextFile(file));
    const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
    const icall = (names, ret, args) => {
      for (const name of names) {
        const at = resolve(Memory.allocUtf8String(name));
        if (!at.isNull()) return new NativeFunction(at, ret, args);
      }
      return null;
    };
    const setVSync = icall(["UnityEngine.QualitySettings::set_vSyncCount(System.Int32)", "UnityEngine.QualitySettings::set_vSyncCount"], "void", ["int"]);
    const getVSync = icall(["UnityEngine.QualitySettings::get_vSyncCount()", "UnityEngine.QualitySettings::get_vSyncCount"], "int", []);
    const engineSetRate = icall(["UnityEngine.Application::set_targetFrameRate(System.Int32)"], "void", ["int"]);
    const getRate = icall(["UnityEngine.Application::get_targetFrameRate()", "UnityEngine.Application::get_targetFrameRate"], "int", []);
    function applyRate(why) {
      if (!rate) return;
      try {
        if (setVSync) setVSync(0);
        if (engineSetRate) engineSetRate(rate);
        else setRate.invoke(rate);
        log(`graphics: frame rate ${rate} (${why}): target ${getRate ? getRate() : "?"}, vSync ${getVSync ? getVSync() : "?"}`);
      } catch (error) {
        log(`graphics: frame rate failed: ${error}`);
      }
    }
    const application = ucls("UnityEngine.Application"), quality = ucls("UnityEngine.QualitySettings");
    const setRate = application.method("set_targetFrameRate", 1);
    if (rate) {
      const engineAt = resolve(Memory.allocUtf8String("UnityEngine.Application::set_targetFrameRate(System.Int32)"));
      if (!engineAt.isNull()) hookAttach(engineAt, { onEnter(args) {
        args[0] = ptr(rate);
      } });
      schedule(0, () => applyRate("start"), "graphics frame rate");
      log(`graphics: engine frame rate setter ${engineSetRate ? "found" : "missing"}, vSync setter ${setVSync ? "found" : "missing"}`);
      if (rate < 60) {
        const usleep = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("usleep"), "int", ["uint"]);
        const frame = 1e3 / rate;
        let next = 0;
        hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
          onEnter() {
            const now = Date.now();
            if (next > now && next - now <= frame) usleep(Math.round((next - now) * 1e3));
            next = Math.max(next + frame, Date.now());
          }
        });
        log(`graphics: frame limiter at ${rate} FPS`);
      }
    }
    const manager = cls(img, "SettingsManager");
    const recommended = cls(img, "ScalabilityUtils").tryMethod("GetRecommendedVideoQualitySettings", 0);
    if (recommended) hookAttach(recommended.virtualAddress, {
      onLeave(result) {
        if (chosenQuality !== null) result.replace(ptr(chosenQuality));
      }
    });
    const updateQuality = manager.tryMethod("UpdateUnityQuality", 1);
    if (updateQuality) hookAttach(updateQuality.virtualAddress, {
      onLeave() {
        schedule(0, () => applyRate("after quality"), "graphics rate after quality");
      }
    });
    const setQuality = manager.tryMethod("SetQuality", 1);
    if (setQuality) hookAttach(setQuality.virtualAddress, {
      onEnter(args) {
        const self = new Il2Cpp.Object(args[0]).ref(false), value = args[1].toInt32();
        schedule(0, () => {
          try {
            chosenQuality = value >= 0 && value <= 3 ? value : null;
            let saved = {};
            try {
              saved = JSON.parse(readTextFile(file) || "{}") || {};
            } catch (_) {
            }
            if (chosenQuality === null) delete saved.quality;
            else saved.quality = chosenQuality;
            writeTextFile(file, JSON.stringify(saved));
            self.target.method("UpdateUnityQuality", 1).invoke(value);
          } catch (error) {
            log(`graphics: quality apply failed: ${error}`);
          } finally {
            self.free();
          }
        }, "graphics quality choice");
      }
    });
    const updateUi = cls(img, "SettingsWin").tryMethod("UpdateUi", 0);
    if (!updateUi || updateUi.virtualAddress.isNull()) return;
    let reported = "";
    const onQuality = cls(img, "SettingsWin").tryMethod("HandleQualityOnValueChanged", 1);
    if (onQuality && !onQuality.virtualAddress.isNull()) hookAttach(onQuality.virtualAddress, {
      onLeave() {
        schedule(0, () => {
          const read = (name) => {
            try {
              return String(quality.method(name, 0).invoke());
            } catch (_) {
              return "?";
            }
          };
          log(`graphics: quality level ${read("GetQualityLevel")}, antiAliasing ${read("get_antiAliasing")}, textureLimit ${read("get_masterTextureLimit")}`);
        }, "graphics quality applied");
      }
    });
    hookAttach(updateUi.virtualAddress, {
      onEnter(args) {
        this.self = args[0];
      },
      onLeave() {
        const window = new Il2Cpp.Object(this.self).ref(false);
        schedule(0, () => {
          try {
            const dropdown = window.target.field("_qualityDropdown").value;
            let state;
            if (!unityAlive(dropdown)) state = "no quality dropdown in this window";
            else {
              const go = call(dropdown, "get_gameObject");
              const shown = Boolean(call(go, "get_activeSelf"));
              if (!shown) call(go, "SetActive", true);
              const video = window.target.field("_videoButton").value;
              const options = Number(call(call(dropdown, "get_options"), "get_Count"));
              const tab = unityAlive(video) ? call(video, "get_activeSelf") ? "video tab visible" : (call(video, "SetActive", true), "video tab shown") : "no video tab";
              let tabs = "";
              try {
                tabs = layoutGameDataTab(window.target) || "game data tab not placed";
              } catch (error) {
                tabs = `game data tab: ${error}`;
              }
              state = `quality dropdown ${shown ? "visible" : "unhidden"}, ${options} levels, ${tab}, ${tabs}`;
            }
            if (state !== reported) {
              reported = state;
              log(`graphics: ${state}`);
            }
          } catch (error) {
            log(`graphics: quality check failed: ${error}`);
          } finally {
            window.free();
          }
        }, "graphics quality");
      }
    });
  });
  section("settings and language diagnostics", () => {
    let lastPoll = 0, lastRequest = "";
    function collect(request) {
      const report = {
        schema: 1,
        label: request.label,
        requestId: request.id,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        buttons: [],
        classes: [],
        localizationFiles: []
      };
      try {
        const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
        report.choice = choice && { language: choice.language, system: choice.system };
      } catch (_) {
      }
      try {
        const status = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-update-status.json`) || "null");
        report.core = status?.current && { revision: status.current.revision, version: status.current.version };
      } catch (_) {
      }
      try {
        const owner = cls(img, "LocalizationManager");
        const nativeType = owner.method("SetLanguage", 2).parameters[0].type;
        report.languageType = { name: nativeType.name, isEnum: nativeType.class.isEnum, fields: nativeType.class.fields.map((f) => ({ name: f.name, type: f.type.name, static: f.isStatic, value: nativeType.class.isEnum && f.isStatic ? enumVal(f.value) : void 0 })) };
        report.localizationMethods = owner.methods.filter((m) => /language|locale|updateobjects/i.test(m.name)).slice(0, 40).map((m) => ({ name: m.name, parameters: m.parameters.map((p) => p.type.name), returns: m.returnType.name }));
        const manager = owner.method("get_Instance", 0).invoke();
        if (!isNull(manager)) report.managerLanguage = String(call(manager, "get_CurrentLanguageCode")?.content || "");
      } catch (error) {
        report.managerError = String(error).slice(0, 300);
      }
      for (const code of ["en_us", "ru_ru"]) {
        try {
          const text = readTextFile(`${persistentPath()}/tesl-localization-${code}.json`);
          const values = Object.values(JSON.parse(text || "{}"));
          report.localizationFiles.push({
            language: code,
            entries: values.length,
            cyrillicValues: values.filter((value) => /[а-яё]/i.test(String(value))).length
          });
        } catch (_) {
          report.localizationFiles.push({ language: code, error: "unreadable" });
        }
      }
      for (const owner of img.classes.filter((c) => /settings|options|language/i.test(c.name)).slice(0, 80)) {
        report.classes.push({ name: owner.name, methods: owner.methods.filter((m) => /language|locale|select|click|show|settings/i.test(m.name)).slice(0, 40).map((m) => ({ name: m.name, parameters: m.parameters.map((p) => p.type.name), returns: m.returnType.name })) });
      }
      try {
        const buttons = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.Button").type.object);
        for (let i = 0; i < buttons.length && report.buttons.length < 160; i++) {
          const button = buttons.get(i), go = call(button, "get_gameObject");
          if (!Boolean(call(go, "get_activeInHierarchy"))) continue;
          let node = call(button, "get_transform");
          const path = [];
          for (let depth = 0; depth < 14 && !isNull(node); depth++, node = call(node, "get_parent"))
            path.unshift(String(call(node, "get_name")?.content || "").slice(0, 120));
          const entry = { path: path.join("/"), callbacks: [] };
          try {
            const event = call(button, "get_onClick"), count = Number(call(event, "GetPersistentEventCount"));
            for (let j = 0; j < Math.min(count, 12); j++) {
              const target = call(event, "GetPersistentTarget", j);
              entry.callbacks.push({ method: String(call(event, "GetPersistentMethodName", j)?.content || ""), class: isNull(target) ? null : target.class.name });
            }
          } catch (_) {
          }
          report.buttons.push(entry);
        }
      } catch (error) {
        report.uiError = String(error).slice(0, 300);
      }
      writeTextFile(`${persistentPath()}/tesl-reborn-settings-report-${request.label}.json`, JSON.stringify(report, null, 2));
    }
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, { onLeave() {
      if (Date.now() - lastPoll < 1e3) return;
      lastPoll = Date.now();
      try {
        const request = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-inspect-request.json`) || "null");
        if (!request || typeof request.id !== "string" || request.id.length > 80 || request.id === lastRequest || !/^(gear|settings|english|russian)$/.test(request.label)) return;
        lastRequest = request.id;
        schedule(0, () => {
          try {
            collect(request);
          } catch (error) {
            log(`settings diagnostic failed: ${error}`);
          }
        });
      } catch (_) {
      }
    } });
  });
  const historyRows = /* @__PURE__ */ new Map(), historyTargets = /* @__PURE__ */ new Map();
  let historyUiReports = 0, historyPopup = null, historyActiveKey = null, historyLastFetch = 0;
  let historyUsingNative = false, historyNativeFailureReported = false;
  const historyTriggerOwners = /* @__PURE__ */ new Map();
  function historyReleaseTrigger(key, record) {
    if (!record.triggerKey) return;
    const owner = historyTriggerOwners.get(record.triggerKey);
    if (owner) {
      owner.users.delete(key);
      if (!owner.users.size) {
        try {
          if (!isNull(owner.trigger.target)) call(owner.trigger.target, "set_enabled", owner.wasEnabled);
        } catch (_) {
        }
        owner.trigger.free();
        historyTriggerOwners.delete(record.triggerKey);
      }
    }
    record.triggerKey = null;
  }
  function historyOwnTrigger(key, record, trigger) {
    const id = trigger.handle.toString();
    if (record.triggerKey !== id) historyReleaseTrigger(key, record);
    let owner = historyTriggerOwners.get(id);
    if (!owner) {
      owner = { trigger: trigger.ref(false), wasEnabled: Boolean(call(trigger, "get_enabled")), users: /* @__PURE__ */ new Set() };
      historyTriggerOwners.set(id, owner);
    }
    owner.users.add(key);
    record.triggerKey = id;
    call(trigger, "set_enabled", false);
  }
  function historyNativeManager() {
    return cls(img, "TooltipManager").method("get_Instance", 0).invoke();
  }
  function historyTryNative(record) {
    let manager = null, boxHandle = null, messageHandle = null;
    try {
      manager = historyNativeManager();
      if (isNull(manager)) throw Error("TooltipManager is not ready");
      call(manager, "HideTooltip");
      const settingsClass = cls(img, "TooltipShowSettings"), settings = settingsClass.alloc();
      boxHandle = settings.ref(false);
      settings.field("anchorRectTransform").value = record.hits[0].rect.target;
      for (const [name, number] of [["anchorEdge", 2], ["tooltipEdge", 3]]) {
        const field = settings.field(name);
        field.value = enumBox(field.type.class, number);
      }
      settings.field("anchorEdgeOffset").value = 0.5;
      settings.field("tooltipEdgeOffset").value = 0.5;
      settings.field("distanceFromAnchor").value = 5;
      settings.field("locKeys").value = uiList(Il2Cpp.corlib.class("System.String"));
      const messages = uiList(Il2Cpp.corlib.class("System.String"));
      messageHandle = messages.ref(false);
      call(messages, "Add", Il2Cpp.string(record.text));
      settings.unbox().method("SetLocalizedMessages", 1).invoke(messages);
      manager.method("ShowTooltip").overload(settingsClass.type.name, "UnityEngine.GameObject", "System.Boolean").invoke(settings.unbox(), call(record.hits[0].rect.target, "get_gameObject"), true);
      return true;
    } catch (error) {
      if (manager) {
        try {
          call(manager, "HideTooltip");
        } catch (_) {
        }
      }
      if (!historyNativeFailureReported) {
        historyNativeFailureReported = true;
        log(`history UI: native popup unavailable; using single fallback: ${error}`);
      }
      return false;
    } finally {
      if (messageHandle) messageHandle.free();
      if (boxHandle) boxHandle.free();
    }
  }
  function historyPopupOpened(key, record, provider) {
    historyActiveKey = key;
    log(`history UI: popup opened index=${record.index} side=${record.side} hasName=${record.hasName} provider=${provider}`);
    if (!record.hasName && Date.now() - historyLastFetch > 5e3) {
      historyLastFetch = Date.now();
      schedule(0, () => refreshMatchEntries());
    }
  }
  function historyTooltipText(name, stats, deleted = false) {
    if (!name) return "No deck data available";
    const title = `<b>${uiPlain(name)}</b>`;
    if (stats) return `${title}
${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)`;
    return deleted ? `${title}
<color=#FF6666>deleted</color>` : title;
  }
  function historyHidePopup() {
    if (historyUsingNative) {
      try {
        call(historyNativeManager(), "HideTooltip");
      } catch (_) {
      }
    }
    if (historyPopup && unityAlive(historyPopup.go.target)) call(historyPopup.go.target, "SetActive", false);
    historyActiveKey = null;
    historyUsingNative = false;
  }
  function historyDropTarget(key) {
    const record = historyTargets.get(key);
    if (!record) return;
    if (historyActiveKey === key) historyHidePopup();
    historyReleaseTrigger(key, record);
    for (const hit of record.hits) {
      try {
        const go = hit.go.target;
        if (!isNull(go)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go);
      } catch (_) {
      }
      hit.go.free();
      hit.rect.free();
    }
    record.row.free();
    historyTargets.delete(key);
  }
  function historyCanvas(component) {
    let canvas = component.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
    if (isNull(canvas)) throw Error("History canvas not found");
    const root = canvas.tryMethod("get_rootCanvas", 0);
    if (root) canvas = root.invoke();
    return canvas;
  }
  function historyShowPopup(key, toggle = true) {
    const record = historyTargets.get(key);
    if (!record) return;
    if (toggle && historyActiveKey === key) {
      historyHidePopup();
      return;
    }
    historyHidePopup();
    if (historyTryNative(record)) {
      historyUsingNative = true;
      historyPopupOpened(key, record, "native");
      return;
    }
    const canvas = historyCanvas(record.hits[0].rect.target);
    const canvasTransform = call(canvas, "get_transform"), canvasKey = canvas.handle.toString();
    if (historyPopup && historyPopup.canvasKey !== canvasKey) {
      ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(historyPopup.go.target);
      historyPopup.go.free();
      historyPopup.label.free();
      historyPopup.rect.free();
      historyPopup = null;
    }
    if (!historyPopup) {
      const go = uiNew("RebornHistoryDeckPopup", canvasTransform);
      uiPlace(go, 0.5, 0.5, 0.5, 0.5, 0, 0, 360, 100);
      call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const background = uiAdd(go, "UnityEngine.UI.Image");
      call(background, "set_color", rgba(0.035, 0.03, 0.02, 0.98));
      const labelGO = uiNew("Text", call(go, "get_transform"));
      const rect = uiRect(labelGO);
      uiStretch(rect);
      call(rect, "set_offsetMin", vec2(12, 10));
      call(rect, "set_offsetMax", vec2(-12, -10));
      const label = uiText(labelGO, "", 23);
      call(label, "set_richText", true);
      call(label, "set_enableWordWrapping", true);
      const autoContainer = label.tryMethod("set_autoSizeTextContainer", 1);
      if (autoContainer) {
        try {
          autoContainer.invoke(false);
        } catch (_) {
        }
      }
      call(rect, "set_anchorMin", vec2(0, 0));
      call(rect, "set_anchorMax", vec2(1, 1));
      call(rect, "set_pivot", vec2(0.5, 0.5));
      call(rect, "set_sizeDelta", vec2(-24, -20));
      call(rect, "set_anchoredPosition", vec2(0, 0));
      historyPopup = { go: go.ref(false), label: label.ref(false), rect: uiRect(go).ref(false), canvasKey };
    }
    const area = call(uiRect(call(canvasTransform, "get_gameObject")), "get_rect");
    const width = Number(area.field("m_Width").value), height = Number(area.field("m_Height").value);
    const panelWidth = Math.max(100, Math.min(420, width - 24));
    call(historyPopup.label.target, "set_text", Il2Cpp.string(record.text));
    let panelHeight = 100;
    try {
      const label = historyPopup.label.target;
      const size = label.method("GetPreferredValues").overload("System.String", "System.Single", "System.Single").invoke(Il2Cpp.string(record.text), panelWidth - 24, 1e5);
      panelHeight = Math.max(64, Math.min(height - 24, uiXY(size).y + 24));
    } catch (_) {
    }
    let x = 0, y = 0;
    try {
      const point = canvasTransform.method("InverseTransformPoint").overload("UnityEngine.Vector3").invoke(call(record.hits[0].rect.target, "get_position"));
      const local = uiXY(point);
      x = local.x - Number(area.field("m_XMin").value) - width / 2;
      y = local.y - Number(area.field("m_YMin").value) - height / 2 + panelHeight / 2 + 28;
    } catch (_) {
    }
    x = Math.max(-width / 2 + panelWidth / 2 + 8, Math.min(width / 2 - panelWidth / 2 - 8, x));
    y = Math.max(-height / 2 + panelHeight / 2 + 8, Math.min(height / 2 - panelHeight / 2 - 8, y));
    call(historyPopup.rect.target, "set_sizeDelta", vec2(panelWidth, panelHeight));
    call(historyPopup.rect.target, "set_anchoredPosition", vec2(x, y));
    call(historyPopup.go.target, "SetActive", true);
    call(call(historyPopup.go.target, "get_transform"), "SetAsLastSibling");
    historyPopupOpened(key, record, "fallback");
  }
  function setHistoryDeckTooltip(row, fieldName, name, stats, index = -1, deleted = false) {
    const images = row.field(fieldName).value;
    if (isNull(images)) return;
    const count = Number(call(images, "get_Count")), key = `${row.handle}:${fieldName}`;
    if (!count) {
      historyDropTarget(key);
      return;
    }
    const imageKeys = [];
    for (let i = 0; i < count; i++) imageKeys.push(images.method("get_Item", 1).invoke(i).handle.toString());
    const signature = imageKeys.join(",");
    let record = historyTargets.get(key);
    if (record && record.signature !== signature) {
      historyDropTarget(key);
      record = null;
    }
    if (!record) {
      record = { row: row.weakRef(false), hits: [], signature, side: fieldName === "_userDeckImages" ? "user" : "opponent" };
      historyTargets.set(key, record);
      for (let i = 0; i < count; i++) {
        const image = images.method("get_Item", 1).invoke(i);
        const hit = uiNew("RebornDeckTap", call(image, "get_transform")), rect = uiRect(hit);
        uiStretch(rect);
        call(rect, "set_offsetMin", vec2(-5, -5));
        call(rect, "set_offsetMax", vec2(5, 5));
        call(uiAdd(hit, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        const graphic = uiAdd(hit, "UnityEngine.UI.Image");
        call(graphic, "set_color", rgba(1, 1, 1, 0));
        call(graphic, "set_raycastTarget", true);
        uiButton(hit, graphic, () => historyShowPopup(key));
        record.hits.push({ go: hit.ref(false), rect: rect.ref(false) });
      }
    }
    record.text = historyTooltipText(name, stats, deleted);
    record.hasName = Boolean(name);
    record.index = index;
    try {
      let parent = call(images.method("get_Item", 1).invoke(0), "get_transform"), tooltip = null;
      for (let i = 0; i < 4 && !isNull(parent); i++) {
        parent = call(parent, "get_parent");
        if (!isNull(parent)) tooltip = parent.method("GetComponent").overload("System.Type").invoke(cls(img, "TooltipTrigger").type.object);
        if (!isNull(tooltip)) break;
      }
      if (!isNull(tooltip)) {
        historyOwnTrigger(key, record, tooltip);
      }
    } catch (error) {
      log(`history UI: automatic tooltip suppression failed: ${error}`);
    }
    if (historyActiveKey === key) historyShowPopup(key, false);
  }
  function updateHistoryTooltips(row, match) {
    let index = -1;
    try {
      const manager = cls(img, "SparkleServices.ServicesManager").method("get_Instance").invoke();
      const history = call(manager.field("Stats").value, "get_MatchHistory");
      index = Number(history.method("IndexOf", 1).invoke(match));
    } catch (error) {
      log(`history UI: service index failed: ${error}`);
    }
    const extra = index >= 0 && index < matchEntryData.length ? matchEntryData[index] : null;
    setHistoryDeckTooltip(row, "_userDeckImages", extra?.deckName || "", extra?.deckStats || null, index, extra?.deckId === -1);
    const difficulty = String(match.field("aiDifficulty").value?.content || "");
    if (!difficulty || difficulty === "None")
      setHistoryDeckTooltip(row, "_opponentDeckImages", extra?.opponentDeckName || "", extra?.opponentDeckStats || null, index);
    else historyDropTarget(`${row.handle}:_opponentDeckImages`);
    if (historyUiReports++ < 12) log(`history UI: tap targets index=${index} extended=${Boolean(extra)}`);
  }
  function refreshHistoryTooltips() {
    for (const [key, handles] of historyRows) {
      try {
        const row = handles.row.target, match = handles.match.target;
        if (!isNull(row) && !isNull(match)) {
          updateHistoryTooltips(row, match);
          continue;
        }
      } catch (error) {
        log(`history UI: refresh failed: ${error}`);
      }
      historyDropTarget(`${key}:_userDeckImages`);
      historyDropTarget(`${key}:_opponentDeckImages`);
      handles.row.free();
      handles.match.free();
      historyRows.delete(key);
    }
  }
  function historyPoll() {
    if (!historyActiveKey || !historyUsingNative && !historyPopup) return;
    try {
      const record = historyTargets.get(historyActiveKey);
      if (!record || !unityAlive(record.row.target) || !Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) {
        historyHidePopup();
        return;
      }
      const input = ucls("UnityEngine.Input");
      let point, down;
      if (Number(input.method("get_touchCount", 0).invoke()) > 0) {
        const touch = input.method("GetTouch", 1).invoke(0);
        down = enumVal(touch.method("get_phase", 0).invoke()) === 0;
        point = uiXY(touch.method("get_position", 0).invoke());
      } else {
        down = Boolean(input.method("GetMouseButtonDown", 1).invoke(0));
        point = uiXY(input.method("get_mousePosition", 0).invoke());
      }
      if (!down) return;
      if (!record.hits.length || !unityAlive(record.hits[0].rect.target)) {
        historyHidePopup();
        return;
      }
      const canvas = historyCanvas(record.hits[0].rect.target), camera = call(canvas, "get_worldCamera");
      if (!historyUsingNative && unityAlive(historyPopup.rect.target) && chatContains(historyPopup.rect.target, point, camera)) return;
      for (const target of historyTargets.values()) for (const hit of target.hits) {
        if (!unityAlive(hit.go.target) || !unityAlive(hit.rect.target)) continue;
        if (Boolean(call(hit.go.target, "get_activeInHierarchy")) && chatContains(hit.rect.target, point, camera)) return;
      }
      historyHidePopup();
    } catch (error) {
      log(`history UI: popup input failed: ${error}`);
      historyHidePopup();
    }
  }
  section("match history deck tooltips", () => {
    const klass = cls(img, "MatchEntry"), seen = /* @__PURE__ */ new Set();
    for (const method of klass.methods.filter((m) => ["UpdateUi", "SetData"].includes(m.name) && !m.isStatic && m.parameterCount === 1 && m.parameters[0].type.name === "SparkleServices.Stats.MatchEntry")) {
      const address = method.virtualAddress.toString();
      if (method.virtualAddress.isNull() || seen.has(address)) continue;
      seen.add(address);
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.row = args[0];
          this.match = args[1];
        },
        onLeave() {
          try {
            const row = new Il2Cpp.Object(this.row), match = new Il2Cpp.Object(this.match);
            const key = row.handle.toString(), old = historyRows.get(key);
            if (old) {
              old.row.free();
              old.match.free();
            }
            historyRows.set(key, { row: row.weakRef(false), match: match.weakRef(false) });
            updateHistoryTooltips(row, match);
          } catch (error) {
            log(`history UI: binding failed: ${error}`);
          }
        }
      });
    }
    if (!seen.size) throw Error("MatchEntry data callbacks not found");
    log(`history UI: tap hooks installed callbacks=${seen.size}`);
    const update = cls(img, "SparkleServices.ServicesManager").methods.find((m) => m.name === "Update" && m.parameterCount === 0);
    if (!update) throw Error("ServicesManager.Update not found");
    hookAttach(update.virtualAddress, { onLeave() {
      historyPoll();
    } });
  });
  function titleDataByName(name) {
    const manager = cls(img, "SPTESL.GameManager").method("get_Instance").invoke();
    const titles = manager.field("Config").value.field("Titles").value;
    const count = Number(call(titles, "get_Count"));
    for (let i = 0; i < count; i++) {
      const title = titles.method("get_Item", 1).invoke(i);
      const id = title.field("ResourceId").value;
      if (String(id.field("UniqueName").value?.content || "") === name) return title;
    }
    return null;
  }
  section("match intro title colour", () => {
    const sequence = cls(img, "SPTESL.SequenceMatchIntro");
    const execute = sequence.methods.find((m) => m.name === "Execute" && m.parameterCount === 2 && /MatchLogAnimationData$/.test(m.parameters[0].type.name) && /BoardState$/.test(m.parameters[1].type.name));
    if (!execute) throw Error("SequenceMatchIntro.Execute(data, boardState) not found");
    const show = cls(img, "MatchIntroWin").tryMethod("Show", 0);
    if (!show || show.virtualAddress.isNull()) throw Error("MatchIntroWin.Show not found");
    const unityObject = ucls("UnityEngine.Object");
    const alive = (value) => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    let pending2 = null;
    const forget = () => {
      if (pending2) {
        pending2.data.free();
        pending2.board.free();
        pending2 = null;
      }
    };
    hookAttach(execute.virtualAddress, {
      onEnter(args) {
        const start = execute.isStatic ? 0 : 1;
        forget();
        pending2 = { data: new Il2Cpp.Object(args[start]).ref(false), board: new Il2Cpp.Object(args[start + 1]).ref(false) };
      }
    });
    function tint(data, board) {
      const players = call(data.field("ActionData").value, "get_MatchIntroPlayers");
      if (isNull(players)) return;
      const win = board.field("MatchUI").value.field("MatchIntroWin").value;
      if (!alive(win)) return;
      const network = cls(img, "SPTESL.GameNetworkManager").method("get_Instance").invoke();
      let tinted = 0;
      for (let i = 0, count = Number(call(players, "get_Count")); i < count; i++) {
        const player = players.method("get_Item", 1).invoke(i);
        const types = call(player, "get_InventoryTypes");
        const titleIndex = Number(types.method("IndexOf", 1).invoke(Il2Cpp.string("title")));
        if (titleIndex < 0) continue;
        const titleName = String(call(player, "get_InventoryValues").method("get_Item", 1).invoke(titleIndex)?.content || "");
        const title = titleDataByName(titleName);
        if (isNull(title) || enumVal(title.field("Rarity").value) !== RARITY_LEGENDARY) continue;
        const own = enumVal(network.method("GetPlayerControllerType", 1).invoke(call(player, "get_PlayerInstanceId"))) === 0;
        const panel = win.field(own ? "MyInfoPanel" : "UrInfoPanel").value;
        if (!alive(panel)) continue;
        const banner = panel.field("TitleBanner").value;
        if (!alive(banner)) continue;
        const resources = cls(img, "UIResourceManager").method("get_Instance").invoke();
        const sprite = resources.method("GetTitleBannerSprite", 1).invoke(enumBox(cls(img, "SPTESL.CardRarity"), 0));
        if (!isNull(sprite)) call(banner, "set_overrideSprite", sprite);
        call(banner, "set_color", rgba(1, 0.75, 0, 1));
        tinted++;
      }
      log(`titles UI: match intro ${tinted ? `legendary banner tinted (${tinted})` : "has no legendary title"}`);
    }
    hookAttach(show.virtualAddress, {
      onLeave() {
        const match = pending2;
        pending2 = null;
        if (!match) return;
        schedule(0, () => {
          try {
            tint(match.data.target, match.board.target);
          } catch (error) {
            log(`titles UI: intro tint failed: ${error}`);
          } finally {
            match.data.free();
            match.board.free();
          }
        }, "match intro tint");
      }
    });
  });
  const emojiByName = /* @__PURE__ */ new Map(), emojiByAscii = /* @__PURE__ */ new Map();
  let emojiDefinitions = [], emojiAsset = null, emojiTexture = null, emojiInitAttempted = false;
  const emojiHandles = [];
  function emojiIndex(definition, columns) {
    return (definition.Row - 1) * columns + definition.Column - 1;
  }
  function emojiFormat(message) {
    let plain = String(message).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    plain = uiPlain(plain);
    plain = plain.split(" ").map((word) => emojiByAscii.has(word) ? `:${emojiByAscii.get(word)}:` : word).join(" ");
    return plain.replace(/:([a-z0-9_]+):/gi, (whole, name) => {
      const definition = emojiByName.get(name);
      return definition ? `<size=130%><sprite=${definition.index}></size>` : whole;
    });
  }
  function initializeEmojis() {
    if (emojiAsset) return true;
    if (emojiInitAttempted) return false;
    emojiInitAttempted = true;
    try {
      const path = `${persistentPath()}/tesl-reborn-emojis`;
      const jsonBytes = File.readAllBytes(`${path}/people.json`), pngBytes = File.readAllBytes(`${path}/people.png`);
      if (Checksum.compute("sha256", jsonBytes) !== "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d" || Checksum.compute("sha256", pngBytes) !== "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa") throw Error("Emoji resource checksum mismatch");
      const definition = JSON.parse(File.readAllText(`${path}/people.json`));
      const shader = ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite"));
      if (isNull(shader)) throw Error("TextMeshPro/Sprite shader is unavailable");
      const texture = ucls("UnityEngine.Texture2D").alloc();
      emojiHandles.push(texture.ref(false));
      texture.method(".ctor").overload("System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean").invoke(2, 2, enumBox(ucls("UnityEngine.TextureFormat"), 4), false);
      const managedBytes = Il2Cpp.corlib.class("System.IO.File").method("ReadAllBytes", 1).invoke(Il2Cpp.string(`${path}/people.png`));
      const loaded = ucls("UnityEngine.ImageConversion").method("LoadImage").overload("UnityEngine.Texture2D", "System.Byte[]").invoke(texture, managedBytes);
      if (!loaded) throw Error("PNG decoding failed");
      const width = Number(call(texture, "get_width")), height = Number(call(texture, "get_height"));
      const columns = width / definition.SpriteSize, rows = height / definition.SpriteSize;
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows > 4096) throw Error("Invalid emoji atlas dimensions");
      const material = ucls("UnityEngine.Material").alloc();
      emojiHandles.push(material.ref(false));
      material.method(".ctor").overload("UnityEngine.Shader").invoke(shader);
      call(material, "set_mainTexture", texture);
      const asset = ucls("UnityEngine.ScriptableObject").method("CreateInstance").overload("System.Type").invoke(ucls("TMPro.TMP_SpriteAsset").type.object);
      emojiHandles.push(asset.ref(false));
      asset.field("spriteSheet").value = texture;
      asset.field("material").value = material;
      const list = uiList(ucls("TMPro.TMP_Sprite"));
      emojiHandles.push(list.ref(false));
      for (let i = 0; i < columns * rows; i++) call(list, "Add", NULL);
      const definitions = definition.Groups.flatMap((group) => group.Sprites);
      for (const item of definitions) {
        if (item.Row < 1 || item.Column < 1 || item.Row > rows || item.Column > columns || !/^[a-z0-9_]+$/.test(item.Name))
          throw Error("Invalid emoji definition");
        const index = emojiIndex(item, columns), sprite = newWith(ucls("TMPro.TMP_Sprite"));
        const spriteHandle = sprite.ref(false);
        const fields = {
          id: index,
          name: Il2Cpp.string(item.Name),
          unicode: index,
          x: (item.Column - 1) * definition.SpriteSize,
          y: height - item.Row * definition.SpriteSize,
          width: definition.SpriteSize,
          height: definition.SpriteSize,
          xOffset: 0,
          yOffset: definition.SpriteSize * 0.8,
          xAdvance: definition.SpriteSize,
          scale: 1
        };
        for (const [key, value] of Object.entries(fields)) sprite.field(key).value = value;
        list.method("set_Item", 2).invoke(index, sprite);
        spriteHandle.free();
        const entry = Object.assign({}, item, { index, u: (item.Column - 1) / columns, v: 1 - item.Row / rows, du: 1 / columns, dv: 1 / rows });
        emojiByName.set(item.Name, entry);
        for (const ascii of String(item.Ascii || "").split(" ").filter(Boolean)) emojiByAscii.set(ascii, item.Name);
      }
      asset.field("spriteInfoList").value = list;
      emojiDefinitions = definitions.map((item) => emojiByName.get(item.Name));
      emojiAsset = asset;
      emojiTexture = texture;
      log(`emoji: initialized ${emojiDefinitions.length} sprites from PC atlas`);
      return true;
    } catch (error) {
      emojiByName.clear();
      emojiByAscii.clear();
      log(`emoji: initialization failed: ${error}`);
      return false;
    }
  }
  const chatMessages = /* @__PURE__ */ new Map();
  let chatMessageReports = 0;
  function chatResetTextRect(rect) {
    call(rect, "set_anchorMin", vec2(0, 0));
    call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5));
    call(rect, "set_sizeDelta", vec2(-16, -8));
    call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function chatFitTextBox(record) {
    const row = call(record.rect.target, "get_rect"), box = call(record.textRect.target, "get_rect");
    const expectedWidth = Number(row.field("m_Width").value) - 16;
    const expectedHeight = Number(row.field("m_Height").value) - 8;
    if (Math.abs(Number(box.field("m_Width").value) - expectedWidth) > 0.5 || Math.abs(Number(box.field("m_Height").value) - expectedHeight) > 0.5) {
      chatResetTextRect(record.textRect.target);
      if (record.boxRepairs++ < 2) log("chat UI: repaired TMP text container bounds");
    }
  }
  function chatPrepareViewport(self) {
    const root = call(self, "get_transform");
    const viewport = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_Messages/Panel_Messages/Scroll_Messages/Viewport"));
    if (isNull(viewport)) {
      log("chat UI: viewport path missing");
      return;
    }
    const go = call(viewport, "get_gameObject");
    ucls("UnityEngine.UI.RectMask2D");
    let rectangle = uiComponent(go, "UnityEngine.UI.RectMask2D");
    if (isNull(rectangle)) rectangle = uiAdd(go, "UnityEngine.UI.RectMask2D");
    const mask = uiComponent(go, "UnityEngine.UI.Mask");
    if (!isNull(mask)) call(mask, "set_enabled", false);
    const image = uiComponent(go, "UnityEngine.UI.Image");
    if (!isNull(image)) call(image, "set_enabled", false);
    call(rectangle, "set_enabled", true);
    log("chat UI: PC viewport mask fix applied (Mask off, Image off, RectMask2D on)");
  }
  function chatLogMessageBounds(record) {
    try {
      let rect = call(record.text.target, "get_rectTransform");
      for (let depth = 0; depth < 7 && !isNull(rect); depth++) {
        const name = String(call(rect, "get_name")?.content || "?");
        const area = call(rect, "get_rect"), point = uiXY(call(rect, "get_anchoredPosition"));
        const scale = uiXY(call(rect, "get_localScale")), pivot = uiXY(call(rect, "get_pivot"));
        log(`chat UI geometry: ${depth}:${name} rect=${Number(area.field("m_Width").value).toFixed(1)}x${Number(area.field("m_Height").value).toFixed(1)} pos=${point.x.toFixed(1)},${point.y.toFixed(1)} pivot=${pivot.x.toFixed(1)},${pivot.y.toFixed(1)} scale=${scale.x.toFixed(2)},${scale.y.toFixed(2)}`);
        const parent = call(rect, "get_parent");
        if (isNull(parent)) break;
        rect = uiRect(call(parent, "get_gameObject"));
      }
    } catch (error) {
      log(`chat UI: geometry probe failed: ${error}`);
    }
  }
  function chatResizeMessage(record) {
    const row = record.row.target, text = record.text.target;
    if (isNull(row) || isNull(text)) return;
    const rect = record.rect.target;
    const area = call(rect, "get_rect");
    const width = Math.max(32, Number(area.field("m_Width").value) - 16);
    if (Math.abs(width - record.width) < 0.5 && record.height > 0) {
      const currentHeight = Number(area.field("m_Height").value);
      if (Math.abs(currentHeight - record.height) > 0.5) {
        call(record.layout.target, "set_preferredHeight", record.height);
        call(record.layout.target, "set_minHeight", record.height);
        call(record.layout.target, "set_flexibleHeight", 0);
        const delta = uiXY(call(rect, "get_sizeDelta"));
        call(rect, "set_sizeDelta", vec2(delta.x, delta.y + record.height - currentHeight));
      }
      chatFitTextBox(record);
      return;
    }
    let height;
    const preferred = text.tryMethod("GetPreferredValues", 3);
    if (preferred) height = uiXY(preferred.overload("System.String", "System.Single", "System.Single").invoke(Il2Cpp.string(record.value), width, 1e5)).y;
    else height = Number(call(text, "get_preferredHeight"));
    height = Math.ceil(Math.max(28, height) + 8);
    if (!Number.isFinite(height) || height > 2e4) throw Error("Invalid chat message height");
    if (Math.abs(height - record.height) > 0.5 || Math.abs(width - record.width) > 0.5) {
      call(record.layout.target, "set_preferredHeight", height);
      call(record.layout.target, "set_minHeight", height);
      call(record.layout.target, "set_flexibleHeight", 0);
      const currentHeight = Number(area.field("m_Height").value), delta = uiXY(call(rect, "get_sizeDelta"));
      call(rect, "set_sizeDelta", vec2(delta.x, delta.y + height - currentHeight));
      record.height = height;
      record.width = width;
    }
    chatFitTextBox(record);
  }
  function chatRefreshMessageSizes() {
    for (const [key, record] of chatMessages) {
      try {
        if (unityAlive(record.row.target)) {
          if (Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) chatResizeMessage(record);
          continue;
        }
      } catch (error) {
        if (!record.warned) {
          record.warned = true;
          log(`chat UI: message layout failed: ${error}`);
        }
      }
      for (const handle of [record.row, record.text, record.rect, record.layout, record.textRect]) handle.free();
      chatMessages.delete(key);
    }
  }
  function renderChatMessage(row, message) {
    if (!initializeEmojis()) return;
    const legacy = row.field("_input").value;
    if (isNull(legacy)) return;
    const template = call(legacy, "get_textComponent");
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = chatMessages.get(key);
    if (!record) {
      const rowGO = call(row, "get_gameObject"), rowRect = uiRect(rowGO);
      const go = uiNew("RebornEmojiMessage", call(rowGO, "get_transform")), rect = uiRect(go);
      call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const text = uiText(go, "", 22);
      const autoContainer = text.tryMethod("set_autoSizeTextContainer", 1);
      let containerConfigured = false;
      if (autoContainer) {
        try {
          autoContainer.invoke(false);
          containerConfigured = true;
        } catch (_) {
        }
      }
      if (!containerConfigured) {
        try {
          text.field("m_autoSizeTextContainer").value = false;
        } catch (_) {
        }
      }
      call(text, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "TopLeft"));
      call(text, "set_raycastTarget", true);
      call(text, "set_enableWordWrapping", true);
      call(text, "set_richText", true);
      call(text, "set_spriteAsset", emojiAsset);
      chatResetTextRect(rect);
      let layout = uiComponent(rowGO, "UnityEngine.UI.LayoutElement");
      if (isNull(layout)) layout = uiAdd(rowGO, "UnityEngine.UI.LayoutElement");
      const parent = call(rowRect, "get_parent");
      const group = uiComponent(call(parent, "get_gameObject"), "UnityEngine.UI.VerticalLayoutGroup");
      if (!isNull(group)) {
        call(group, "set_childControlHeight", true);
        call(group, "set_childForceExpandHeight", false);
        call(group, "set_childControlWidth", true);
        call(group, "set_childForceExpandWidth", true);
        call(group, "set_childAlignment", enumBox(ucls("UnityEngine.TextAnchor"), 0));
      }
      record = {
        row: row.weakRef(false),
        text: text.ref(false),
        rect: rowRect.ref(false),
        layout: layout.ref(false),
        textRect: rect.ref(false),
        width: -1,
        height: -1,
        value: "",
        warned: false,
        boxRepairs: 0
      };
      chatMessages.set(key, record);
      if (chatMessages.size <= 2) schedule(500, () => chatLogMessageBounds(record));
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    const value = `${username ? `<b>${uiPlain(username)}</b>
` : ""}${emojiFormat(body)}`;
    if (record.value !== value) {
      record.value = value;
      record.width = -1;
      record.height = -1;
    }
    call(record.text.target, "set_text", Il2Cpp.string(value));
    chatResizeMessage(record);
    call(legacy, "set_enabled", false);
    call(template, "set_enabled", false);
    if (chatMessageReports++ < 4) log(`chat UI: message fitted height=${record.height}; row-relative bounds`);
  }
  section("chat emoji rendering", () => {
    const klass = cls(img, "ChatMessageEntry");
    const method = klass.methods.find((m) => m.name === "SetData" && m.parameterCount >= 1 && !m.isStatic);
    if (!method || method.parameters[0].type.class.isValueType) throw Error("ChatMessageEntry.SetData reference Message not found");
    hookAttach(method.virtualAddress, {
      onEnter(args) {
        this.row = args[0];
        this.message = args[1];
      },
      onLeave() {
        try {
          renderChatMessage(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message));
        } catch (error) {
          log(`emoji: message rendering failed: ${error}`);
        }
      }
    });
  });
  section("chat message layout refresh", () => {
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      hookAttach(render.virtualAddress, { onEnter() {
        chatRefreshMessageSizes();
      } });
    } else {
      const tick = () => {
        chatRefreshMessageSizes();
        schedule(100, tick, "chat message sizes");
      };
      schedule(100, tick, "chat message sizes");
    }
  });
  const messagePreviews = /* @__PURE__ */ new Map();
  let messagePreviewReports = 0;
  function emojiPreviewFormat(source, richText) {
    const normalized = String(source).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    if (!richText) return emojiFormat(normalized);
    return normalized.split(/(<\/?(?:b|i|size|color)(?:=[^<>]*)?>)/gi).map((part) => /^<\/?(?:b|i|size|color)(?:=[^<>]*)?>$/i.test(part) ? part : emojiFormat(part)).join("");
  }
  function messagePreviewBounds(record) {
    const rect = record.rect.target;
    call(rect, "set_anchorMin", vec2(0, 0));
    call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5));
    call(rect, "set_sizeDelta", vec2(0, 0));
    call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function refreshMessagePreview(record) {
    const template = record.template.target, label = record.label.target;
    if (isNull(template) || isNull(label)) return false;
    let source = String(call(template, "get_text")?.content || "");
    if (!source) source = record.fallbackText;
    const richText = Boolean(call(template, "get_supportRichText"));
    if (source !== record.source || richText !== record.richText) {
      call(label, "set_text", Il2Cpp.string(emojiPreviewFormat(source, richText)));
      record.source = source;
      record.richText = richText;
    }
    const fontSize = Number(call(template, "get_fontSize"));
    if (fontSize > 0 && fontSize !== record.fontSize) {
      call(label, "set_fontSize", fontSize);
      record.fontSize = fontSize;
    }
    call(label, "set_color", call(template, "get_color"));
    try {
      const originalRenderer = call(template, "get_canvasRenderer"), renderer = call(label, "get_canvasRenderer");
      call(renderer, "SetColor", call(originalRenderer, "GetColor"));
    } catch (_) {
    }
    const parentArea = call(call(template, "get_rectTransform"), "get_rect");
    const area = call(record.rect.target, "get_rect");
    if (Math.abs(Number(area.field("m_Width").value) - Number(parentArea.field("m_Width").value)) > 0.5 || Math.abs(Number(area.field("m_Height").value) - Number(parentArea.field("m_Height").value)) > 0.5) messagePreviewBounds(record);
    call(template, "set_enabled", false);
    return true;
  }
  function dropMessagePreview(key, record) {
    try {
      if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true);
    } catch (_) {
    }
    try {
      if (!isNull(record.label.target)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(record.label.target, "get_gameObject"));
    } catch (_) {
    }
    for (const handle of [record.row, record.template, record.label, record.rect]) handle.free();
    messagePreviews.delete(key);
  }
  function renderMessagePreview(row, message) {
    if (!emojiAsset) {
      try {
        if (isNull(ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite")))) return;
      } catch (_) {
        return;
      }
    }
    if (!initializeEmojis()) return;
    const template = row.field("_text").value;
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = messagePreviews.get(key);
    if (record && (isNull(record.template.target) || record.template.target.handle.toString() !== template.handle.toString())) {
      dropMessagePreview(key, record);
      record = null;
    }
    if (!record) {
      let go = null;
      try {
        go = uiNew("PreviewRichText", call(template, "get_transform"));
        call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        const label = uiText(go, "", 22);
        const autoContainer = label.tryMethod("set_autoSizeTextContainer", 1);
        let configured = false;
        if (autoContainer) {
          try {
            autoContainer.invoke(false);
            configured = true;
          } catch (_) {
          }
        }
        if (!configured) {
          try {
            label.field("m_autoSizeTextContainer").value = false;
          } catch (_) {
          }
        }
        call(label, "set_richText", true);
        call(label, "set_raycastTarget", true);
        call(label, "set_enableWordWrapping", enumVal(call(template, "get_horizontalOverflow")) === 0);
        const alignments = ["TopLeft", "Top", "TopRight", "Left", "Center", "Right", "BottomLeft", "Bottom", "BottomRight"];
        const alignment = enumVal(call(template, "get_alignment"));
        call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", alignments[alignment] || "TopLeft"));
        const overflow = label.method("set_overflowMode", 1);
        overflow.invoke(enumBox(overflow.parameters[0].type.class, 3));
        call(label, "set_spriteAsset", emojiAsset);
        record = {
          row: row.weakRef(false),
          template: template.weakRef(false),
          label: label.ref(false),
          rect: uiRect(go).ref(false),
          fallbackText: "",
          source: null,
          richText: null,
          fontSize: null
        };
        messagePreviewBounds(record);
        messagePreviews.set(key, record);
      } catch (error) {
        if (go) {
          try {
            ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go);
          } catch (_) {
          }
        }
        throw error;
      }
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    record.fallbackText = `${username ? `${username}: ` : ""}${body}`;
    refreshMessagePreview(record);
    if (messagePreviewReports++ < 4) log("emoji preview: rendered with shared chat sprite atlas");
  }
  function refreshMessagePreviews() {
    for (const [key, record] of messagePreviews) {
      try {
        if (unityAlive(record.row.target) && unityAlive(record.template.target)) {
          if (Boolean(call(call(record.template.target, "get_gameObject"), "get_activeInHierarchy"))) refreshMessagePreview(record);
          continue;
        }
      } catch (error) {
        try {
          if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true);
        } catch (_) {
        }
        log(`emoji preview: refresh failed: ${error}`);
      }
      dropMessagePreview(key, record);
    }
  }
  section("message preview emoji rendering", () => {
    const klass = cls(img, "MessagePreviewEntry");
    const methods = klass.methods.filter((m) => m.name === "SetData" && !m.isStatic && m.parameterCount >= 1 && m.parameters[0].type.class.name === "Message" && !m.parameters[0].type.class.isValueType && !m.virtualAddress.isNull());
    if (!methods.length) throw Error("MessagePreviewEntry.SetData(Message, ...) not found");
    const seen = /* @__PURE__ */ new Set();
    for (const method of methods) {
      const address = method.virtualAddress.toString();
      if (seen.has(address)) continue;
      seen.add(address);
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.row = args[0];
          this.message = args[1];
        },
        onLeave() {
          try {
            renderMessagePreview(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message));
          } catch (error) {
            log(`emoji preview: rendering failed: ${error}`);
          }
        }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) hookAttach(render.virtualAddress, { onEnter() {
      refreshMessagePreviews();
    } });
    else {
      const tick = () => {
        refreshMessagePreviews();
        schedule(100, tick, "message previews");
      };
      schedule(100, tick, "message previews");
    }
    log(`emoji preview: hooks installed callbacks=${seen.size}`);
  });
  function chatScaleApply(record) {
    if (!record.baseScale || !Number.isFinite(record.factor)) return;
    const rect = record.rect.target, current = call(rect, "get_localScale"), base = record.baseScale;
    const x = base.x * record.factor, y = base.y * record.factor;
    if (Math.abs(Number(current.field("x").value) - x) > 1e-3 || Math.abs(Number(current.field("y").value) - y) > 1e-3)
      call(rect, "set_localScale", unityStruct("UnityEngine.Vector3", { x, y, z: base.z }));
  }
  function chatScaleSetup(record) {
    const rect = record.rect.target, scale = call(rect, "get_localScale");
    record.baseScale = {
      x: Number(scale.field("x").value) || 1,
      y: Number(scale.field("y").value) || 1,
      z: Number(scale.field("z").value) || 1
    };
    const area = call(rect, "get_rect"), screen = chatScreen();
    const canvasScale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
    record.maxFactor = Math.max(0.45, Math.min(
      1.8,
      (screen.width / canvasScale - 24) / Math.max(1, Number(area.field("m_Width").value) * Math.abs(record.baseScale.x)),
      (screen.height / canvasScale - 24) / Math.max(1, Number(area.field("m_Height").value) * Math.abs(record.baseScale.y))
    ));
    record.factor = Math.min(1, record.maxFactor);
    try {
      const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`) || "null");
      if (saved && Number.isFinite(saved.factor)) record.factor = Math.max(0.45, Math.min(record.maxFactor, saved.factor));
    } catch (_) {
    }
    record.scaleEnabled = true;
    chatScaleApply(record);
    log(`chat UI: scale enabled range=0.45..${record.maxFactor.toFixed(2)}; pinch only`);
  }
  function chatScaleSet(record, factor) {
    record.factor = Math.max(0.45, Math.min(record.maxFactor, factor));
    chatScaleApply(record);
  }
  function chatScaleSave(record) {
    writeTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`, JSON.stringify({ factor: record.factor }));
    log(`chat UI: scale saved factor=${record.factor.toFixed(2)}`);
  }
  function chatScaleUpdate(record) {
    if (!record.scaleEnabled) return false;
    const input = ucls("UnityEngine.Input"), count = Number(input.method("get_touchCount", 0).invoke());
    const camera = call(record.canvas.target, "get_worldCamera");
    if (count >= 2) {
      const a = input.method("GetTouch", 1).invoke(0), b = input.method("GetTouch", 1).invoke(1);
      const ap = uiXY(a.method("get_position", 0).invoke()), bp = uiXY(b.method("get_position", 0).invoke());
      const phases = [a, b].map((t) => enumVal(t.method("get_phase", 0).invoke()));
      if (phases.some((p) => p === 3 || p === 4)) {
        if (record.pinch) {
          record.pinch = null;
          chatScaleSave(record);
        }
        return true;
      }
      if (!record.pinch) {
        if (!chatContains(record.rect.target, ap, camera) || !chatContains(record.rect.target, bp, camera)) return false;
        record.pinch = { distance: Math.max(1, Math.hypot(ap.x - bp.x, ap.y - bp.y)), factor: record.factor };
        record.dragging = false;
        record.armed = false;
      }
      chatScaleSet(record, record.pinch.factor * Math.hypot(ap.x - bp.x, ap.y - bp.y) / record.pinch.distance);
      return true;
    }
    if (record.pinch) {
      record.pinch = null;
      chatScaleSave(record);
      return true;
    }
    return false;
  }
  const chatWindows = /* @__PURE__ */ new Map();
  const chatSetupDiagnosed = /* @__PURE__ */ new Set();
  function chatInputInsert(record, name) {
    const input = record.input.target;
    const text = String(call(input, "get_text")?.content || "");
    const index = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    const insertion = `:${name}: `;
    call(input, "set_text", Il2Cpp.string(text.slice(0, index) + insertion + text.slice(index)));
    record.caret = index + insertion.length;
    const caret = input.tryMethod("set_stringPosition", 1) || input.tryMethod("set_caretPosition", 1);
    if (caret) caret.invoke(record.caret);
    call(input, "ActivateInputField");
  }
  function chatBuildPicker(record) {
    if (record.picker) return true;
    if (!initializeEmojis()) return false;
    const go = uiNew("RebornEmojiPicker", record.window.target);
    uiPlace(go, 1, 0, 1, 0, -16, 84, 284, 250);
    call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
    const bg = uiAdd(go, "UnityEngine.UI.Image");
    call(bg, "set_color", rgba(0.08, 0.08, 0.08, 0.98));
    const root = call(go, "get_transform");
    record.picker = go.ref(false);
    record.page = 0;
    record.cells = [];
    for (let i = 0; i < 48; i++) {
      const cell = uiNew(`Emoji${i}`, root);
      uiPlace(cell, 0, 1, 0, 1, 6 + i % 8 * 34, -6 - Math.floor(i / 8) * 34, 30, 30);
      const icon = uiAdd(cell, "UnityEngine.UI.RawImage");
      call(icon, "set_texture", emojiTexture);
      uiButton(cell, icon, () => {
        const entry = emojiDefinitions[record.page * 48 + i];
        if (!entry) return;
        chatInputInsert(record, entry.Name);
        call(record.picker.target, "SetActive", false);
      });
      record.cells.push({ object: cell.ref(false), image: icon.ref(false) });
    }
    uiLabeledButton("Previous", root, "<", -196, -216, 68, () => chatPickerPage(record, -1));
    uiLabeledButton("Next", root, ">", -112, -216, 68, () => chatPickerPage(record, 1));
    uiLabeledButton("Close", root, "X", -8, -216, 68, () => call(record.picker.target, "SetActive", false));
    chatPickerPage(record, 0);
    call(go, "SetActive", false);
    return true;
  }
  function chatPickerPage(record, delta) {
    const pages = Math.ceil(emojiDefinitions.length / 48);
    record.page = (record.page + delta + pages) % pages;
    for (let i = 0; i < record.cells.length; i++) {
      const entry = emojiDefinitions[record.page * 48 + i], cell = record.cells[i];
      call(cell.object.target, "SetActive", !!entry);
      if (!entry) continue;
      call(cell.image.target, "set_uvRect", unityStruct("UnityEngine.Rect", {
        m_XMin: entry.u,
        m_YMin: entry.v,
        m_Width: entry.du,
        m_Height: entry.dv
      }));
    }
    log(`emoji: picker page ${record.page + 1}/${pages}`);
  }
  function chatFind(root, path) {
    const value = call(root, "Find", Il2Cpp.string(path));
    if (isNull(value)) throw Error(`Chat UI path missing: ${path}`);
    return value;
  }
  function chatSetup(self) {
    const key = self.handle.toString();
    if (chatWindows.has(key)) return;
    let controls = null, pickerCreated = null, createdRecord = null;
    try {
      const root = call(self, "get_transform"), window = chatFind(root, "Window");
      const inputTransform = chatFind(root, "Window/Section_BottomSmallChat/Input_Message");
      const inputGO = call(inputTransform, "get_gameObject");
      let input = uiComponent(inputGO, "TMPro.TMP_InputField");
      if (isNull(input)) input = uiComponent(inputGO, "UnityEngine.UI.InputField");
      if (isNull(input)) throw Error("Chat input component not found");
      const canvas = window.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
      if (isNull(canvas)) throw Error("Chat canvas not found");
      const windowGO = call(window, "get_gameObject"), rect = uiRect(windowGO);
      const header = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_PlayerInfo"));
      let handle;
      if (!isNull(header)) handle = uiRect(call(header, "get_gameObject"));
      else {
        controls = uiNew("RebornChatControls", window);
        uiPlace(controls, 0.5, 1, 0.5, 1, 0, -3, 70, 28);
        call(uiAdd(controls, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        handle = uiRect(uiLabeledButton("MoveChat", call(controls, "get_transform"), "Move", 0, 0, 70, () => {
        }));
      }
      const record = {
        self: self.weakRef(false),
        window: window.ref(false),
        rect: rect.ref(false),
        input: input.ref(false),
        canvas: canvas.ref(false),
        controls: (controls || windowGO).ref(false),
        dragging: false,
        caret: null,
        errors: 0,
        picker: null,
        desired: null,
        handle: handle.ref(false)
      };
      createdRecord = record;
      const picker = uiNew("EmojiPickerButton", inputTransform);
      pickerCreated = picker;
      uiPlace(picker, 1, 1, 1, 0, -16, -63, 46, 46);
      call(uiAdd(picker, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const hit = uiAdd(picker, "UnityEngine.UI.Image");
      call(hit, "set_color", rgba(1, 1, 1, 0));
      const labelGO = uiNew("Label", call(picker, "get_transform"));
      uiStretch(uiRect(labelGO));
      const label = uiText(labelGO, "", 30);
      if (initializeEmojis()) {
        call(label, "set_spriteAsset", emojiAsset);
        call(label, "set_richText", true);
        call(label, "set_text", Il2Cpp.string("<sprite=8>"));
      } else call(label, "set_text", Il2Cpp.string(":)"));
      const pickerButton = uiButton(picker, hit, () => {
        if (!chatBuildPicker(record)) return;
        const panel = record.picker.target;
        call(panel, "SetActive", !Boolean(call(panel, "get_activeSelf")));
        if (Boolean(call(panel, "get_activeSelf"))) call(call(panel, "get_transform"), "SetAsLastSibling");
      });
      const transition = pickerButton.tryMethod("set_transition", 1);
      if (transition) transition.invoke(enumBox(transition.parameters[0].type.class, 0));
      record.pickerButton = uiRect(picker).ref(false);
      try {
        const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`) || "null");
        const screen = chatScreen();
        if (saved && saved.width === screen.width && saved.height === screen.height && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          record.desired = { x: saved.x, y: saved.y };
          call(rect, "set_anchoredPosition", vec2(saved.x, saved.y));
        }
      } catch (_) {
      }
      chatWindows.set(key, record);
      try {
        chatPrepareViewport(self);
      } catch (error) {
        log(`chat UI: viewport preparation failed: ${error}`);
      }
      try {
        chatScaleSetup(record);
      } catch (error) {
        log(`chat UI: scale setup failed: ${error}`);
      }
      log(`chat UI: drag=${controls ? "Move fallback" : "player header"}; PC smiley installed`);
    } catch (error) {
      for (const object of [controls, pickerCreated]) if (object) {
        try {
          ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(object);
        } catch (_) {
        }
      }
      if (createdRecord) for (const value of Object.values(createdRecord)) {
        if (value && typeof value.free === "function") {
          try {
            value.free();
          } catch (_) {
          }
        }
      }
      log(`chat UI: setup failed: ${error}`);
      if (!chatSetupDiagnosed.has(key)) {
        chatSetupDiagnosed.add(key);
        try {
          uiLogTree(call(self, "get_transform"), "chat UI paths");
        } catch (_) {
        }
      }
    }
  }
  function chatContains(rect, point, camera) {
    return Boolean(ucls("UnityEngine.RectTransformUtility").method("RectangleContainsScreenPoint").overload("UnityEngine.RectTransform", "UnityEngine.Vector2", "UnityEngine.Camera").invoke(rect, vec2(point.x, point.y), camera));
  }
  function chatScreen() {
    const screen = ucls("UnityEngine.Screen");
    return { width: Number(screen.method("get_width", 0).invoke()), height: Number(screen.method("get_height", 0).invoke()) };
  }
  function chatBoundPointer(point) {
    const screen = chatScreen();
    return {
      x: Math.max(16, Math.min(screen.width - 16, point.x)),
      y: Math.max(16, Math.min(screen.height - 16, point.y))
    };
  }
  function chatApplyPosition(record) {
    if (!record.desired) return;
    const rect = record.rect.target, current = uiXY(call(rect, "get_anchoredPosition"));
    if (Math.abs(current.x - record.desired.x) > 0.1 || Math.abs(current.y - record.desired.y) > 0.1)
      call(rect, "set_anchoredPosition", vec2(record.desired.x, record.desired.y));
  }
  function chatUpdate(self) {
    const record = chatWindows.get(self.handle.toString());
    if (!record || record.errors > 3) return;
    try {
      if (!Boolean(call(record.controls.target, "get_activeInHierarchy"))) return;
      if (chatScaleUpdate(record)) return;
      const input = record.input.target;
      if (Boolean(call(input, "get_isFocused"))) {
        const caret = input.tryMethod("get_stringPosition", 0) || input.tryMethod("get_caretPosition", 0);
        if (caret) record.caret = Number(caret.invoke());
      }
      const unityInput = ucls("UnityEngine.Input");
      let point, held, down;
      if (Number(unityInput.method("get_touchCount").invoke()) > 0) {
        const touch = unityInput.method("GetTouch", 1).invoke(0);
        point = uiXY(touch.method("get_position", 0).invoke());
        const phase = enumVal(touch.method("get_phase", 0).invoke());
        down = phase === 0;
        held = phase !== 3 && phase !== 4;
      } else {
        point = uiXY(unityInput.method("get_mousePosition").invoke());
        held = Boolean(unityInput.method("GetMouseButton", 1).invoke(0));
        down = Boolean(unityInput.method("GetMouseButtonDown", 1).invoke(0));
      }
      const camera = call(record.canvas.target, "get_worldCamera");
      const rect = record.rect.target;
      if (down && Boolean(call(call(record.handle.target, "get_gameObject"), "get_activeInHierarchy")) && chatContains(record.handle.target, point, camera)) {
        record.armed = true;
        record.start = point;
        record.origin = uiXY(call(rect, "get_anchoredPosition"));
      }
      if (record.armed && held && !record.dragging && Math.hypot(point.x - record.start.x, point.y - record.start.y) >= 8) {
        record.dragging = true;
        log("chat UI: drag started");
      }
      if (record.dragging && held) {
        const scale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
        const bounded = chatBoundPointer(point);
        record.desired = {
          x: record.origin.x + (bounded.x - record.start.x) / scale,
          y: record.origin.y + (bounded.y - record.start.y) / scale
        };
        chatApplyPosition(record);
      }
      if (record.dragging && !held) {
        record.dragging = false;
        const screen = chatScreen();
        writeTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`, JSON.stringify(Object.assign({}, record.desired, screen)));
        log("chat UI: position saved");
      }
      if (!held) record.armed = false;
      chatApplyPosition(record);
      chatScaleApply(record);
      if (down && record.picker && Boolean(call(record.picker.target, "get_activeSelf")) && !chatContains(uiRect(record.picker.target), point, camera) && !chatContains(record.pickerButton.target, point, camera))
        call(record.picker.target, "SetActive", false);
      record.errors = 0;
    } catch (error) {
      record.errors++;
      record.dragging = false;
      log(`chat UI: update failed: ${error}`);
    }
  }
  section("movable chat and emoji picker", () => {
    const klass = cls(img, "FriendsChatWin");
    const update = klass.methods.find((m) => m.name === "Update" && !m.isStatic && m.parameterCount === 0);
    if (!update) throw Error("FriendsChatWin.Update not found");
    for (const method of klass.methods.filter((m) => ["Awake", "Show"].includes(m.name) && !m.isStatic)) {
      if (method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
        },
        onLeave() {
          try {
            chatSetup(new Il2Cpp.Object(this.self));
          } catch (error) {
            log(`chat UI: ${error}`);
          }
        }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) hookAttach(render.virtualAddress, {
      onLeave() {
        for (const record of chatWindows.values()) {
          try {
            if (Boolean(call(record.controls.target, "get_activeInHierarchy"))) {
              chatApplyPosition(record);
              chatScaleApply(record);
            }
          } catch (_) {
          }
        }
      }
    });
    hookAttach(update.virtualAddress, {
      onEnter(args) {
        this.self = args[0];
      },
      onLeave() {
        try {
          chatUpdate(new Il2Cpp.Object(this.self));
        } catch (_) {
        }
      }
    });
  });
  section("hide confirmed debug test marker", () => {
    const path = `${persistentPath()}/tesl-reborn-debug-marker.json`;
    const latch = `${persistentPath()}/tesl-reborn-debug-marker-confirmed32.json`;
    let applied = false;
    try {
      applied = JSON.parse(readTextFile(latch) || "{}").applied === true;
    } catch (_) {
    }
    if (applied) return;
    let config = {};
    try {
      config = JSON.parse(readTextFile(path) || "{}");
    } catch (_) {
    }
    if (writeTextFile(path, JSON.stringify({ ...config, enabled: false }))) writeTextFile(latch, JSON.stringify({ applied: true }));
  });
  section("mobile global debug shortcut", () => {
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "null");
      if (setup?.debugInput === "android-key-events") {
        log("mobile debug: Android keyboard gesture backend");
        return;
      }
    } catch (_) {
    }
    let taps = [], startFrame = -1, keyDownFrame = -1, lastFrame = -1, began = null, lastError = "";
    const input = ucls("UnityEngine.Input"), time = ucls("UnityEngine.Time");
    const frame = () => Number(time.method("get_frameCount", 0).invoke());
    function diagnostic(status, detail = "") {
      log(`mobile debug: ${status}${detail ? ": " + detail : ""}`);
      try {
        writeTextFile(`${persistentPath()}/tesl-reborn-debug-status.json`, JSON.stringify({ status, detail, at: (/* @__PURE__ */ new Date()).toISOString() }));
      } catch (_) {
      }
    }
    const attached = /* @__PURE__ */ new Set();
    function attachKey(address, name, stringKey = false) {
      if (!address || address.isNull?.() || attached.has(address.toString())) return;
      try {
        hookAttach(address, {
          onEnter(args) {
            this.key = stringKey ? rawStr(args[0]).toLowerCase() : args[0]?.toInt32();
          },
          onLeave(result) {
            if (startFrame < 0) return;
            const current = frame();
            if (current > startFrame + 5) {
              startFrame = -1;
              return;
            }
            if (current < startFrame || keyDownFrame >= 0 && current !== keyDownFrame) return;
            const any = /anyKey/.test(name), down = /Down/.test(name);
            const d = stringKey ? this.key === "d" : this.key === 100;
            const ctrl = stringKey ? ["left ctrl", "right ctrl", "left control", "right control"].includes(this.key) : [305, 306].includes(this.key);
            if (!any && !d && !ctrl) return;
            if (d && down && keyDownFrame < 0) {
              keyDownFrame = current;
              diagnostic("ctrl-d-forwarded", name);
            }
            if (any || d || ctrl && !down) result.replace(ptr(1));
          }
        });
        attached.add(address.toString());
      } catch (error) {
        log(`mobile debug: cannot hook ${name}: ${error}`);
      }
    }
    for (const method of input.methods.filter((m) => /^(GetKey(?:Down)?(?:Int|String)?|get_anyKey(?:Down)?)$/.test(m.name))) {
      const stringKey = method.parameters[0]?.type.name === "System.String";
      try {
        attachKey(method.virtualAddress, method.name, stringKey);
      } catch (error) {
        log(`mobile debug: input method unavailable ${method.name}: ${error}`);
      }
    }
    try {
      const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
      for (const name of ["GetKeyInt", "GetKeyDownInt", "GetKeyString", "GetKeyDownString", "get_anyKey", "get_anyKeyDown"]) {
        const signature = name.endsWith("Int") ? "UnityEngine.KeyCode" : name.endsWith("String") ? "System.String" : "";
        for (const suffix of ["", `(${signature})`]) {
          const address = resolve(Memory.allocUtf8String(`UnityEngine.Input::${name}${suffix}`));
          attachKey(address, name, name.endsWith("String"));
        }
      }
    } catch (error) {
      log(`mobile debug: native input resolution unavailable: ${error}`);
    }
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    hookAttach(update.virtualAddress, {
      onEnter() {
        try {
          const current = frame();
          if (current === lastFrame) return;
          lastFrame = current;
          const count = Number(input.method("get_touchCount", 0).invoke());
          if (count !== 1) {
            began = null;
            if (count > 1) taps = [];
            return;
          }
          const touch = input.method("GetTouch", 1).invoke(0), phase = enumVal(touch.method("get_phase", 0).invoke());
          const point = uiXY(touch.method("get_position", 0).invoke()), screen = chatScreen();
          const size = Math.max(64, Math.min(160, Math.min(screen.width, screen.height) * 0.1));
          const inside = point.x >= 0 && point.x <= size && point.y >= screen.height - size && point.y <= screen.height;
          if (phase === 0) {
            began = inside ? { x: point.x, y: point.y, at: Date.now() } : null;
            return;
          }
          if (phase === 4) {
            began = null;
            taps = [];
            return;
          }
          if (phase !== 3) return;
          const now = Date.now();
          if (!inside || !began || now - began.at > 400 || Math.hypot(point.x - began.x, point.y - began.y) > size * 0.35) {
            began = null;
            taps = [];
            return;
          }
          began = null;
          taps = taps.filter((at) => now - at < 1100);
          taps.push(now);
          if (taps.length >= 3) {
            taps = [];
            startFrame = current + 1;
            keyDownFrame = -1;
            diagnostic("gesture-detected");
          }
        } catch (error) {
          const message = String(error);
          if (message !== lastError) {
            lastError = message;
            diagnostic("input-error", message);
          }
        }
      }
    });
    diagnostic("ready", `${attached.size} input hooks; original Ctrl+D permissions preserved`);
  });
  function createUpdateNotices(updater, io) {
    let downloadStarted = false, lastStatus = "";
    const saved = io.readNotice() || {}, current = updater.current();
    const previous = io.readStatus()?.previous;
    const priorRevision = Number(saved.shownRevision || previous?.revision || 0);
    if (Number.isSafeInteger(current?.revision) && current.revision > priorRevision) {
      if (priorRevision > 0) io.emit("applied", current.revision, () => io.writeNotice({ shownRevision: current.revision }));
      else io.writeNotice({ shownRevision: current.revision });
    }
    function poll() {
      const status = updater.status();
      if (status === lastStatus) return;
      lastStatus = status;
      if (status === "restart-required") {
        downloadStarted = false;
        io.emit("restart", 0);
      } else if (status === "update-error" && downloadStarted) {
        downloadStarted = false;
        io.emit("error", 0);
      }
    }
    return {
      poll,
      check(get) {
        let requests = 0;
        try {
          updater.check((url, callback) => {
            if (++requests === 2) {
              downloadStarted = true;
              io.emit("downloading", 0);
            }
            get(url, (status, body) => {
              callback(status, body);
              poll();
            });
          });
        } finally {
          poll();
        }
      }
    };
  }
  function updateNoticeText(kind, revision, language) {
    const messages = {
      en: {
        downloading: "Downloading a Reborn update. You can keep playing.",
        restart: "Reborn update downloaded and verified. Restart the game when convenient to apply it.",
        applied: `Reborn update ${revision} applied.`,
        error: "Reborn update could not be downloaded or verified. You can keep playing; it will retry on the next launch."
      },
      ru: {
        downloading: "\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Reborn. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C \u0438\u0433\u0440\u0430\u0442\u044C.",
        restart: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Reborn \u0441\u043A\u0430\u0447\u0430\u043D\u043E \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u0438\u0433\u0440\u0443, \u043A\u043E\u0433\u0434\u0430 \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u043E\u0431\u043D\u043E, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0435\u0433\u043E.",
        applied: `\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Reborn ${revision} \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u043E.`,
        error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Reborn. \u041C\u043E\u0436\u043D\u043E \u0438\u0433\u0440\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u0448\u0435; \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u043C \u043F\u0440\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435."
      },
      de: {
        downloading: "Ein Reborn-Update wird heruntergeladen. Du kannst weiterspielen.",
        restart: "Reborn-Update heruntergeladen und gepr\xFCft. Starte das Spiel neu, wenn es dir passt, um es anzuwenden.",
        applied: `Reborn-Update ${revision} angewendet.`,
        error: "Reborn-Update konnte nicht geladen oder gepr\xFCft werden. Du kannst weiterspielen; neuer Versuch beim n\xE4chsten Start."
      },
      es: {
        downloading: "Descargando una actualizaci\xF3n de Reborn. Puedes seguir jugando.",
        restart: "Actualizaci\xF3n de Reborn descargada y verificada. Reinicia el juego cuando quieras para aplicarla.",
        applied: `Actualizaci\xF3n ${revision} de Reborn aplicada.`,
        error: "No se pudo descargar o verificar la actualizaci\xF3n de Reborn. Puedes seguir jugando; se reintentar\xE1 al iniciar."
      },
      fr: {
        downloading: "T\xE9l\xE9chargement d\u2019une mise \xE0 jour Reborn. Vous pouvez continuer \xE0 jouer.",
        restart: "Mise \xE0 jour Reborn t\xE9l\xE9charg\xE9e et v\xE9rifi\xE9e. Red\xE9marrez le jeu quand vous le souhaitez pour l\u2019appliquer.",
        applied: `Mise \xE0 jour Reborn ${revision} appliqu\xE9e.`,
        error: "Impossible de t\xE9l\xE9charger ou v\xE9rifier la mise \xE0 jour Reborn. Vous pouvez jouer ; nouvel essai au prochain lancement."
      },
      it: {
        downloading: "Download di un aggiornamento Reborn. Puoi continuare a giocare.",
        restart: "Aggiornamento Reborn scaricato e verificato. Riavvia il gioco quando vuoi per applicarlo.",
        applied: `Aggiornamento Reborn ${revision} applicato.`,
        error: "Impossibile scaricare o verificare l\u2019aggiornamento Reborn. Puoi giocare; nuovo tentativo al prossimo avvio."
      },
      pl: {
        downloading: "Pobieranie aktualizacji Reborn. Mo\u017Cesz gra\u0107 dalej.",
        restart: "Aktualizacja Reborn pobrana i zweryfikowana. Uruchom gr\u0119 ponownie w dogodnym momencie, aby j\u0105 zastosowa\u0107.",
        applied: `Aktualizacja Reborn ${revision} zastosowana.`,
        error: "Nie uda\u0142o si\u0119 pobra\u0107 lub sprawdzi\u0107 aktualizacji Reborn. Mo\u017Cesz gra\u0107 dalej; ponowimy pr\xF3b\u0119 przy nast\u0119pnym uruchomieniu."
      },
      pt: {
        downloading: "Baixando uma atualiza\xE7\xE3o do Reborn. Voc\xEA pode continuar jogando.",
        restart: "Atualiza\xE7\xE3o do Reborn baixada e verificada. Reinicie o jogo quando quiser para aplic\xE1-la.",
        applied: `Atualiza\xE7\xE3o ${revision} do Reborn aplicada.`,
        error: "N\xE3o foi poss\xEDvel baixar ou verificar a atualiza\xE7\xE3o do Reborn. Voc\xEA pode jogar; nova tentativa na pr\xF3xima inicializa\xE7\xE3o."
      },
      tr: {
        downloading: "Reborn g\xFCncellemesi indiriliyor. Oynamaya devam edebilirsiniz.",
        restart: "Reborn g\xFCncellemesi indirildi ve do\u011Fruland\u0131. Uygulamak i\xE7in uygun oldu\u011Funuzda oyunu yeniden ba\u015Flat\u0131n.",
        applied: `Reborn ${revision} g\xFCncellemesi uyguland\u0131.`,
        error: "Reborn g\xFCncellemesi indirilemedi veya do\u011Frulanamad\u0131. Oynamaya devam edebilirsiniz; sonraki a\xE7\u0131l\u0131\u015Fta yeniden denenecek."
      }
    };
    return (messages[String(language).slice(0, 2)] || messages.en)[kind] || "";
  }
  let cachedPortCaption = "";
  let splashVersionAnchor = { x: 0.5, y: 0.34 }, splashAnchorReady = false;
  function locateSplashVersion() {
    if (splashAnchorReady) return splashVersionAnchor;
    try {
      const type = cls(img, "SplashWin"), values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(type.type.object);
      for (let i = 0; i < values.length; i++) {
        const self = values.get(i);
        if (!call(call(self, "get_gameObject"), "get_activeInHierarchy")) continue;
        const logo = self.field("_logoImage").value, rect = call(logo, "get_rectTransform"), bounds = call(rect, "get_rect");
        const point = unityStruct("UnityEngine.Vector3", {
          x: Number(bounds.field("m_XMin").value) + Number(bounds.field("m_Width").value) / 2,
          y: Number(bounds.field("m_YMin").value) - 12,
          z: 0
        });
        const world = call(rect, "TransformPoint", point), canvas = call(logo, "get_canvas");
        let camera = null;
        try {
          camera = call(canvas, "get_worldCamera");
        } catch (_) {
        }
        const screen = ucls("UnityEngine.RectTransformUtility").method("WorldToScreenPoint", 2).invoke(camera, world), size = chatScreen();
        const x = Number(screen.field("x").value) / size.width, y = Number(screen.field("y").value) / size.height;
        if (x > 0.1 && x < 0.9 && y > 0.1 && y < 0.9) {
          splashVersionAnchor = { x, y: Math.max(0.34, y) };
          splashAnchorReady = true;
          log("loading version: anchored below native SplashWin logo");
        }
        break;
      }
    } catch (_) {
    }
    return splashVersionAnchor;
  }
  let loginAnchorCheck = 0, loginAnchor = null, loginAnchorLogged = false;
  let loginAnchorError = "";
  function worldBottom(node) {
    const rect = call(node, "get_rect"), scale = Number(call(node, "get_lossyScale").field("y").value);
    return Number(call(node, "get_position").field("y").value) + Number(rect.field("m_YMin").value) * scale;
  }
  function locateLoginVersion(frame) {
    if (Date.now() < loginAnchorCheck) return loginAnchor;
    loginAnchorCheck = Date.now() + 500;
    loginAnchor = null;
    try {
      const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(cls(img, "LoginWin").type.object);
      for (let i = 0; i < values.length; i++) {
        const self = values.get(i);
        if (!unityAlive(self) || !call(call(self, "get_gameObject"), "get_activeInHierarchy")) continue;
        let low = Infinity;
        for (const name of ["_loginBtn", "_unameForgotBtn", "_pwdForgotBtn"]) {
          const button = self.field(name).value;
          if (!unityAlive(button) || !call(call(button, "get_gameObject"), "get_activeInHierarchy")) continue;
          low = Math.min(low, worldBottom(call(button, "get_transform")));
        }
        if (!Number.isFinite(low)) continue;
        const frameRect = call(frame, "get_rect"), frameScale = Number(call(frame, "get_lossyScale").field("y").value);
        const height = Number(frameRect.field("m_Height").value) * frameScale;
        if (!(height > 0)) continue;
        const y = (low - worldBottom(frame)) / height;
        loginAnchor = { x: 0.5, y: Math.min(0.9, Math.max(0.08, y - 0.02)) };
        if (!loginAnchorLogged) {
          loginAnchorLogged = true;
          log(`loading version: below the login form at ${loginAnchor.y.toFixed(2)}`);
        }
        break;
      }
    } catch (error) {
      const detail = String(error);
      if (detail !== loginAnchorError) {
        loginAnchorError = detail;
        log(`loading version: login form placement failed: ${detail}`);
      }
    }
    return loginAnchor;
  }
  function portVersionCaption() {
    if (cachedPortCaption) return cachedPortCaption;
    let build = "legacy";
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "{}");
      if (Number.isSafeInteger(setup.androidBuild)) build = String(setup.androidBuild);
    } catch (_) {
    }
    const revision = globalThis.TeslRebornUpdater?.current()?.revision;
    let channel = "";
    try {
      const feed = String(JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-updater.json`) || "{}").feedUrl || "");
      channel = /\/updates\/stable\//.test(feed) ? " (stable)" : /\/updates\/test\//.test(feed) ? " (test)" : "";
    } catch (_) {
    }
    return cachedPortCaption = `Reborn ${PLUGIN_VERSION}
Android \xB7 APK ${build} \xB7 patch ${Number.isSafeInteger(revision) ? revision : "embedded"}${channel}`;
  }
  function noticeCanvasProperty(canvas, name, value) {
    const method = canvas.tryMethod(name, value === void 0 ? 0 : 1);
    if (!method) {
      const error = new Error(`Notice Canvas managed binding unavailable: ${name}`);
      error.noticeCanvasUnavailable = true;
      throw error;
    }
    if (value === void 0) return method.invoke();
    const type = method.parameters[0].type.class;
    return method.invoke(type.isEnum ? enumBox(type, value) : value);
  }
  function uiSystemText(go, text, size) {
    let label = null;
    try {
      const type = ucls("UnityEngine.UI.Text");
      if (!type.tryMethod("set_font", 1)) throw Error("Legacy Text setters stripped");
      const font = ucls("UnityEngine.Resources").method("GetBuiltinResource").overload("System.Type", "System.String").invoke(ucls("UnityEngine.Font").type.object, Il2Cpp.string("Arial.ttf"));
      if (isNull(font)) throw Error("Built-in notice font is unavailable");
      label = uiAdd(go, "UnityEngine.UI.Text");
      call(label, "set_font", font);
      call(label, "set_fontSize", size);
      call(label, "set_raycastTarget", false);
      call(label, "set_supportRichText", false);
      call(label, "set_alignment", uiEnum("UnityEngine.TextAnchor", "MiddleCenter"));
      call(label, "set_color", rgba(1, 1, 1, 1));
      call(label, "set_text", Il2Cpp.string(text));
      return label;
    } catch (_) {
      if (label) try {
        ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(label);
      } catch (_2) {
      }
      return uiText(go, text, size);
    }
  }
  function noticeTextLayout(label, right = false) {
    const tmp = label.class.type.name === "TMPro.TextMeshProUGUI";
    call(label, "set_alignment", uiEnum(
      tmp ? "TMPro.TextAlignmentOptions" : "UnityEngine.TextAnchor",
      right ? tmp ? "Right" : "MiddleRight" : tmp ? "Center" : "MiddleCenter"
    ));
    if (!right) {
      const options = tmp ? [["set_enableAutoSizing", true], ["set_fontSizeMin", 18], ["set_fontSizeMax", 22]] : [["set_resizeTextForBestFit", true], ["set_resizeTextMinSize", 18], ["set_resizeTextMaxSize", 22]];
      for (const [name, value] of options) label.tryMethod(String(name), 1)?.invoke(value);
    }
  }
  function isLoadingVersionScreen(sceneName, names) {
    const loading = /^(?:.*[\/ _-])?(?:loading|bootstrap|splash)(?:screen|scene|canvas|win|controller)?(?:\(clone\))?$/i;
    return loading.test(String(sceneName || "")) || names.some((name) => loading.test(String(name)));
  }
  let startupVersionComplete = false, startupReadyHooked = false;
  let versionScreenCheck = 0, versionScreenState = { visible: false, scene: "" };
  function installStartupVersionTracking() {
    try {
      const owner = img.classes.find((c) => c.name === "MainMenuNavManager");
      const init = owner?.methods.find((m) => m.name === "Init" && !m.isStatic && !m.virtualAddress.isNull());
      if (init) {
        hookAttach(init.virtualAddress, { onLeave() {
          startupVersionComplete = true;
          versionScreenCheck = 0;
        } });
        startupReadyHooked = true;
      }
    } catch (error) {
      log(`loading version readiness: ${error}`);
    }
  }
  function startupVersionVisible(scene, ready) {
    return !ready && !/^(?:mainmenu|battle|match|gameboard|login)$/i.test(String(scene || ""));
  }
  function loadingVersionState() {
    if (Date.now() < versionScreenCheck) return versionScreenState;
    versionScreenCheck = Date.now() + 500;
    let scene = "", names = [];
    try {
      const value = ucls("UnityEngine.SceneManagement.SceneManager").method("GetActiveScene", 0).invoke();
      scene = String(value.method("get_name", 0).invoke()?.content || "");
    } catch (_) {
    }
    try {
      const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
      for (const owner of img.classes.filter((c) => /^(?:LoadingScreen|LoadingWin|LoadingScreenController|GameLoadingScreen)$/.test(c.name) && Array.from(c.hierarchy()).some((base) => base.type.name === "UnityEngine.Component"))) {
        const values = find.invoke(owner.type.object);
        for (let i = 0; i < values.length; i++) {
          const go = call(values.get(i), "get_gameObject");
          if (call(go, "get_activeInHierarchy")) names.push(String(call(go, "get_name")?.content || owner.name));
        }
      }
    } catch (_) {
    }
    if (!startupVersionComplete) try {
      for (const name of ["BoardInputController", "MatchIntroWin"]) {
        const owner = img.classes.find((c) => c.name === name);
        if (!owner) continue;
        const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(owner.type.object);
        for (let i = 0; i < values.length; i++) if (call(call(values.get(i), "get_gameObject"), "get_activeInHierarchy")) {
          startupVersionComplete = true;
          break;
        }
      }
    } catch (_) {
    }
    if (!startupVersionComplete && !startupReadyHooked) try {
      const owner = img.classes.find((c) => c.name === "MainMenuNavManager");
      if (owner) {
        const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(owner.type.object);
        for (let i = 0; i < values.length; i++) {
          const go = call(values.get(i), "get_gameObject");
          if (call(go, "get_activeInHierarchy") && Number(call(call(go, "get_transform"), "get_childCount")) > 0) startupVersionComplete = true;
        }
      }
    } catch (_) {
    }
    return versionScreenState = { visible: startupVersionVisible(scene, startupVersionComplete), scene };
  }
  const fpsCounter = { frames: 0, since: Date.now(), value: 0 };
  function fpsMeterEnabled() {
    try {
      const graphics = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-graphics.json`) || "null");
      if (typeof graphics?.showFps === "boolean") return graphics.showFps;
    } catch (_) {
    }
    try {
      const updater = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-updater.json`) || "null");
      return /\/updates\/test\//.test(String(updater?.feedUrl || ""));
    } catch (_) {
      return false;
    }
  }
  function fpsSample(counter, now) {
    const elapsed = now - counter.since;
    if (elapsed < 1e3) return counter.value;
    counter.value = Math.round(counter.frames * 1e3 / elapsed);
    counter.frames = 0;
    counter.since = now;
    return counter.value;
  }
  function createUpdateBanner() {
    const showFps = fpsMeterEnabled();
    let fps = null, fpsText = null, fpsLogAt = 0;
    let root = null, label = null, canvas = null, panel = null, badge = null, badgeText = null;
    let disabled = false, canvasScale = 1, nested2 = false, hostRetryAt = 0, hostReportAt = 0;
    let hostKey = "", hostCheckAt = 0, shownVersion = null, hostRoots = [];
    let message = null, shownAt = 0, lastError = "";
    const unityObject = ucls("UnityEngine.Object");
    const alive = (value) => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    function overlayHost() {
      const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
      let host = null, rank = -Infinity;
      const seen = hostRoots = [];
      for (let i = 0; i < values.length; i++) {
        const candidate = values.get(i);
        if (!alive(candidate) || !call(candidate, "get_isRootCanvas")) continue;
        const go = call(candidate, "get_gameObject");
        if (!call(go, "get_activeInHierarchy")) continue;
        const mode = enumVal(call(candidate, "get_renderMode")), sorting = Number(call(candidate, "get_sortingOrder"));
        seen.push(`${String(call(go, "get_name")?.content || "?")}:${mode}/${sorting}`);
        if (mode !== 0 && mode !== 1) continue;
        const score = (mode === 0 ? 1e6 : 0) + sorting;
        if (score >= rank) {
          host = candidate;
          rank = score;
        }
      }
      if (!host && Date.now() >= hostReportAt) {
        hostReportAt = Date.now() + 3e4;
        log(`update notice: no screen Canvas to host it; live roots ${seen.slice(0, 12).join(", ") || "none"}`);
      }
      return host;
    }
    let reportedCaption = "", badgeBackground = null, gradientTexture = null, gradientSprite = null;
    function discard() {
      if (root) {
        try {
          ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(root.target);
        } catch (_) {
        }
        root.free();
      }
      for (const asset of [gradientSprite, gradientTexture]) if (asset) try {
        ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(asset);
      } catch (_) {
      }
      gradientTexture = gradientSprite = badgeBackground = null;
      fps = fpsText = null;
      root = label = canvas = panel = badge = badgeText = null;
    }
    function ensure(wanted) {
      if (disabled) return;
      let better = null;
      if (root) {
        if (!alive(root.target)) discard();
        else {
          if (!nested2 || !wanted || Date.now() < hostCheckAt) return;
          hostCheckAt = Date.now() + 2e3;
          better = overlayHost();
          if (!better || better.handle.toString() === hostKey) return;
          discard();
        }
      }
      nested2 = !ucls("UnityEngine.Canvas").tryMethod("set_renderMode", 1);
      let host = better;
      if (nested2 && !host) {
        if (Date.now() < hostRetryAt) return;
        host = overlayHost();
        if (!host) {
          hostRetryAt = Date.now() + 2e3;
          return;
        }
      }
      if (host) {
        hostKey = host.handle.toString();
        hostCheckAt = Date.now() + 2e3;
      }
      const go = newWith(
        ucls("UnityEngine.GameObject"),
        Il2Cpp.string("RebornUpdateNotice"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object])
      );
      root = go.ref(false);
      try {
        canvas = uiAdd(go, "UnityEngine.Canvas");
        if (!nested2) {
          noticeCanvasProperty(canvas, "set_renderMode", 0);
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          noticeCanvasProperty(canvas, "set_scaleFactor", 1);
          canvasScale = 1;
        } else {
          call(go, "set_layer", Number(call(call(host, "get_gameObject"), "get_layer")));
          call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(call(host, "get_transform"), false);
          uiStretch(uiRect(go));
          noticeCanvasProperty(canvas, "set_overrideSorting", true);
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          canvasScale = Number(call(host, "get_scaleFactor")) || 1;
          log(`update notice: nested under ${String(call(call(host, "get_gameObject"), "get_name")?.content || "?")} (order ${Number(call(host, "get_sortingOrder"))}); live roots ${hostRoots.slice(0, 12).join(", ")}`);
        }
        panel = uiNew("Banner", call(go, "get_transform"));
        const background = uiAdd(panel, "UnityEngine.UI.Image");
        call(background, "set_color", rgba(0.09, 0.11, 0.14, 0.95));
        call(background, "set_raycastTarget", false);
        const text = uiNew("Message", call(panel, "get_transform"));
        uiStretch(uiRect(text));
        call(uiRect(text), "set_offsetMin", vec2(16, 10));
        call(uiRect(text), "set_offsetMax", vec2(-16, -10));
        label = uiSystemText(text, "", 22);
        noticeTextLayout(label);
        badge = uiNew("PortVersion", call(go, "get_transform"));
        badgeBackground = uiAdd(badge, "UnityEngine.UI.Image");
        call(badgeBackground, "set_raycastTarget", false);
        call(badgeBackground, "set_color", rgba(0, 0, 0, 0.8));
        call(badgeBackground, "set_color", rgba(0, 0, 0, 0));
        for (let i = 0; i < 32; i++) {
          const strip = uiNew("Fade" + i, call(badge, "get_transform")), rect = uiRect(strip);
          call(rect, "set_anchorMin", vec2(i / 32, 0));
          call(rect, "set_anchorMax", vec2((i + 1) / 32, 1));
          call(rect, "set_offsetMin", vec2(0, 0));
          call(rect, "set_offsetMax", vec2(0, 0));
          const graphic = uiAdd(strip, "UnityEngine.UI.Image"), t = (i + 0.5) / 32;
          call(graphic, "set_color", rgba(0, 0, 0, Math.min(1, Math.min(t, 1 - t) * 3) * 0.8));
          call(graphic, "set_raycastTarget", false);
        }
        const badgeLabel = uiNew("RebornPluginVersion", call(badge, "get_transform"));
        uiStretch(uiRect(badgeLabel));
        badgeText = uiSystemText(badgeLabel, "", 26);
        try {
          call(badgeText, badgeText.class.type.name === "TMPro.TextMeshProUGUI" ? "set_richText" : "set_supportRichText", true);
        } catch (_) {
        }
        call(badgeText, "set_alignment", uiEnum(badgeText.class.type.name === "TMPro.TextMeshProUGUI" ? "TMPro.TextAlignmentOptions" : "UnityEngine.TextAnchor", badgeText.class.type.name === "TMPro.TextMeshProUGUI" ? "Center" : "MiddleCenter"));
        call(badgeText, "set_color", rgba(1, 1, 1, 1));
        if (showFps) {
          fps = uiNew("RebornFps", call(go, "get_transform"));
          const back = uiAdd(fps, "UnityEngine.UI.Image");
          call(back, "set_color", rgba(0, 0, 0, 0.6));
          call(back, "set_raycastTarget", false);
          const inner = uiNew("Value", call(fps, "get_transform"));
          uiStretch(uiRect(inner));
          fpsText = uiSystemText(inner, "", 22);
          noticeTextLayout(fpsText);
          call(fpsText, "set_color", rgba(0.4, 1, 0.4, 1));
        }
        if (!nested2) ucls("UnityEngine.Object").method("DontDestroyOnLoad").overload("UnityEngine.Object").invoke(go);
        call(panel, "SetActive", false);
      } catch (error) {
        if (error?.noticeCanvasUnavailable) disabled = true;
        discard();
        throw error;
      }
    }
    return {
      show(kind, revision, onShown) {
        message = { kind, revision, onShown, duration: kind === "restart" ? 1e4 : 6e3 };
        shownAt = 0;
      },
      tick() {
        if (disabled) return;
        if (message && shownAt && Date.now() - shownAt >= message.duration) {
          try {
            if (panel) call(panel, "SetActive", false);
          } catch (_) {
            discard();
          }
          message = null;
        }
        try {
          const versionScreen = loadingVersionState();
          ensure(versionScreen.visible || Boolean(message) || showFps);
          if (!root) return;
          const screen = chatScreen();
          const scale = nested2 ? Math.max(0.1, Number(call(call(canvas, "get_rootCanvas"), "get_scaleFactor")) || canvasScale) : Math.max(0.1, Math.min(screen.width / 1280, screen.height / 720));
          if (nested2) canvasScale = scale;
          else if (Math.abs(scale - canvasScale) >= 0.01) {
            noticeCanvasProperty(canvas, "set_scaleFactor", scale);
            canvasScale = scale;
          }
          const width = Math.min(1e3, screen.width / scale - 32);
          let top = 16;
          try {
            const safe = ucls("UnityEngine.Screen").method("get_safeArea", 0).invoke();
            top += Math.max(0, screen.height - Number(call(safe, "get_yMax"))) / scale;
          } catch (_) {
          }
          const badgeAnchor = locateLoginVersion(call(root.target, "get_transform")) || locateSplashVersion();
          uiPlace(badge, badgeAnchor.x, badgeAnchor.y, 0.5, 1, 0, 0, Math.min(620, Math.max(240, width)), 72);
          call(badge, "SetActive", versionScreen.visible);
          if (shownVersion !== versionScreen.visible) {
            shownVersion = versionScreen.visible;
            log(`loading version: ${versionScreen.visible ? "shown" : "hidden"} (scene "${versionScreen.scene}")`);
          }
          const measured = fpsSample(fpsCounter, Date.now());
          if (Date.now() >= fpsLogAt && measured) {
            fpsLogAt = Date.now() + 15e3;
            log(`fps: ${measured}`);
          }
          if (fps) {
            uiPlace(fps, 0, 1, 0, 1, 12, -top, 110, 36);
            call(fpsText, "set_text", Il2Cpp.string(`${measured} FPS`));
          }
          const caption = portVersionCaption();
          call(badgeText, "set_text", Il2Cpp.string(caption.replace("\nAndroid", "\n<size=20>Android") + "</size>"));
          const signature = caption + ":" + versionScreen.visible + ":" + versionScreen.scene;
          if (signature !== reportedCaption) {
            reportedCaption = signature;
            try {
              writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ version: caption, visible: versionScreen.visible, scene: versionScreen.scene, at: (/* @__PURE__ */ new Date()).toISOString() }));
            } catch (_) {
            }
          }
          if (!message) {
            lastError = "";
            return;
          }
          uiPlace(panel, 0.5, 1, 0.5, 1, 0, -top, Math.max(240, width), 92);
          call(label, "set_text", Il2Cpp.string(updateNoticeText(message.kind, message.revision, resourceLanguage())));
          call(panel, "SetActive", true);
          if (!shownAt) shownAt = Date.now();
          else if (message.onShown) {
            const acknowledge = message.onShown;
            message.onShown = null;
            acknowledge();
          }
          lastError = "";
        } catch (error) {
          const detail = String(error);
          if (detail !== lastError) {
            log(`update notice: ${detail}`);
            lastError = detail;
            try {
              writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ error: detail.slice(0, 300), at: (/* @__PURE__ */ new Date()).toISOString() }));
            } catch (_) {
            }
          }
        }
      }
    };
  }
  function installUpdateNotices(updater) {
    installStartupVersionTracking();
    const banner = createUpdateBanner();
    const noticeFile = `${persistentPath()}/tesl-reborn-update-notice.json`;
    const read = (path) => {
      try {
        return JSON.parse(readTextFile(path) || "null");
      } catch (_) {
        return null;
      }
    };
    const notices = createUpdateNotices(updater, {
      readNotice: () => read(noticeFile),
      readStatus: () => read(`${persistentPath()}/tesl-reborn-update-status.json`),
      writeNotice: (value) => {
        try {
          if (writeTextFile(noticeFile + ".part", JSON.stringify(value))) atomicRename(noticeFile + ".part", noticeFile);
        } catch (_) {
        }
      },
      emit: (kind, revision, onShown) => banner.show(kind, revision, onShown)
    });
    let nextPoll = 0, queued = false;
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        fpsCounter.frames++;
        if (queued || Date.now() < nextPoll) return;
        queued = true;
        nextPoll = Date.now() + 250;
        schedule(0, () => {
          queued = false;
          try {
            notices.poll();
            banner.tick();
          } catch (error) {
            log(`update notice poll: ${error}`);
          }
        });
      }
    });
    schedule(1e3, () => {
      const prelaunch = read(`${persistentPath()}/tesl-reborn-prelaunch-status.json`);
      const age = Date.now() - Number(prelaunch?.checkedAt);
      if (Number.isFinite(age) && age >= 0 && age < 6e4) {
        log("updater: prelaunch gate handled this start");
        return;
      }
      notices.check((url, callback) => httpGet(url, false, callback, true));
    });
  }
  function rememberShopSnapshot(previous, report) {
    if (!(report.shopImages || []).some((item) => !/MainMenuLandingWin|Left_Store_BTN/i.test(item.path))) return previous;
    return { at: report.at, images: report.shopImages, events: report.events.filter((item) => /shop|store|pack|bundle|image|texture|sprite/i.test(item.path)) };
  }
  section("bounded startup resource diagnostics", () => {
    let taken = false, lastShop = null;
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        if (taken || Date.now() - resourceTraceStarted < 6e4) return;
        taken = true;
        schedule(0, () => {
          const report = {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            language: resourceLanguage(),
            patch: globalThis.TeslRebornUpdater?.current()?.revision,
            elapsedMs: Date.now() - resourceTraceStarted,
            events: resourceTrace.slice(),
            bundles: []
          };
          try {
            const manager = cls(img, "AssetBundles.AssetBundleManager");
            for (const field of manager.fields.filter((f) => f.isStatic && /load|bundle|error/i.test(f.name) && /Dictionary/.test(f.type.name))) {
              const item = { name: field.name, type: field.type.name };
              try {
                const dictionary = field.value;
                item.count = Number(call(dictionary, "get_Count"));
                const iterator = call(call(dictionary, "get_Keys"), "GetEnumerator");
                item.keys = [];
                try {
                  while (item.keys.length < 12 && call(iterator, "MoveNext")) {
                    const key = call(iterator, "get_Current");
                    if (typeof key?.content === "string") item.keys.push(key.content.replace(/[?#].*$/, "").slice(0, 160));
                  }
                } finally {
                  try {
                    call(iterator, "Dispose");
                  } catch (_) {
                  }
                }
              } catch (error) {
                item.error = String(error).slice(0, 120);
              }
              report.bundles.push(item);
            }
          } catch (error) {
            report.error = String(error).slice(0, 160);
          }
          try {
            report.menu = [];
            const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
            const owners = img.classes.filter((c) => /^(?:MainMenu|MainMenuNavManager|MainMenuNavComponent|SettingsWin)$/.test(c.name) && Array.from(c.hierarchy()).some((base) => base.type.name === "UnityEngine.Component"));
            for (const owner of owners) {
              const values = find.invoke(owner.type.object);
              for (let i = 0; i < Math.min(values.length, 16) && report.menu.length < 32; i++) {
                const component = values.get(i), go = call(component, "get_gameObject"), root = call(go, "get_transform");
                const item = {
                  type: owner.type.name,
                  name: String(call(go, "get_name")?.content || "").slice(0, 120),
                  active: Boolean(call(go, "get_activeInHierarchy")),
                  children: Number(call(root, "get_childCount")),
                  nodes: []
                };
                for (let j = 0; j < Math.min(item.children, 12); j++) {
                  const child = call(call(root, "GetChild", j), "get_gameObject");
                  item.nodes.push({ name: String(call(child, "get_name")?.content || "").slice(0, 120), active: Boolean(call(child, "get_activeInHierarchy")) });
                }
                report.menu.push(item);
              }
            }
          } catch (error) {
            report.menuError = String(error).slice(0, 160);
          }
          try {
            report.shopImages = [];
            const images = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.Image").type.object);
            for (let i = 0; i < images.length && report.shopImages.length < 40; i++) {
              const image = images.get(i), go = call(image, "get_gameObject");
              if (!call(go, "get_activeInHierarchy")) continue;
              let node = call(go, "get_transform"), path = "";
              for (let depth = 0; depth < 10 && !isNull(node); depth++, node = call(node, "get_parent")) path = String(call(node, "get_name")?.content || "") + "/" + path;
              if (!/shop|store|packbundle|product/i.test(path)) continue;
              const item = { path: path.slice(-400) };
              try {
                const sprite = call(image, "get_sprite");
                item.sprite = isNull(sprite) ? null : String(call(sprite, "get_name")?.content || "");
              } catch (_) {
              }
              try {
                const material = call(image, "get_material");
                item.material = isNull(material) ? null : String(call(material, "get_name")?.content || "");
                if (!isNull(material)) item.shader = String(call(call(material, "get_shader"), "get_name")?.content || "");
              } catch (_) {
              }
              report.shopImages.push(item);
            }
          } catch (error) {
            report.shopError = String(error).slice(0, 160);
          }
          try {
            const images = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.RawImage").type.object);
            for (let i = 0; i < images.length && report.shopImages.length < 64; i++) {
              const image = images.get(i), go = call(image, "get_gameObject");
              if (!call(go, "get_activeInHierarchy")) continue;
              let node = call(go, "get_transform"), path = "";
              for (let depth = 0; depth < 10 && !isNull(node); depth++, node = call(node, "get_parent")) path = String(call(node, "get_name")?.content || "") + "/" + path;
              if (!/shop|store|packbundle|product/i.test(path)) continue;
              const item = { path: path.slice(-400), type: "RawImage" }, texture = call(image, "get_texture");
              item.texture = isNull(texture) ? null : String(call(texture, "get_name")?.content || "");
              if (!isNull(texture)) {
                item.width = Number(call(texture, "get_width"));
                item.height = Number(call(texture, "get_height"));
              }
              report.shopImages.push(item);
            }
          } catch (error) {
            report.shopRawError = String(error).slice(0, 160);
          }
          lastShop = rememberShopSnapshot(lastShop, report);
          report.lastShop = lastShop;
          writeTextFile(`${persistentPath()}/tesl-reborn-resource-status.json`, JSON.stringify(report));
        }, "resource diagnostics snapshot");
      }
    });
  });
  function redundantSettingsResolution(values, current, inSettings) {
    return inSettings && values.length >= 3 && values[0] === current.width && values[1] === current.height && typeof values[2] === "boolean" && (values.length === 3 || values.length === 4 && values[3] === 0);
  }
  function createDisplayTrace(write) {
    let events = [], last = "";
    return (kind, values) => {
      const key = kind + JSON.stringify(values);
      if (kind === "sample" && key === last) return;
      last = key;
      events.push({ at: Date.now(), kind, ...values });
      if (events.length > 60) events.shift();
      write({ schema: 1, patch: globalThis.TeslRebornUpdater?.current()?.revision, events: events.slice() });
    };
  }
  section("Settings display diagnostics", () => {
    let watchUntil = 0, root = null;
    let pendingReport = null, flushQueued = false, lastFlush = 0, lastDimensions = "";
    function flushDisplay() {
      flushQueued = false;
      if (!pendingReport) return;
      writeTextFile(`${persistentPath()}/tesl-reborn-display-status.json`, JSON.stringify(pendingReport));
      pendingReport = null;
      lastFlush = Date.now();
    }
    const trace = createDisplayTrace((value) => {
      pendingReport = value;
      if (Date.now() - lastFlush >= 100) flushDisplay();
      else if (!flushQueued) {
        flushQueued = true;
        schedule(100, flushDisplay, "display flush");
      }
      const event = value.events[value.events.length - 1], dimensions = event.width + "x" + event.height;
      if (event.kind !== "sample" || dimensions !== lastDimensions) log(`settings display: ${JSON.stringify(event)}`);
      lastDimensions = dimensions;
    });
    function capture() {
      const screen = chatScreen(), value = { width: screen.width, height: screen.height };
      if (root) try {
        const go = root.target, transform = call(go, "get_transform");
        value.active = Boolean(call(go, "get_activeInHierarchy"));
        const scale = call(transform, "get_localScale");
        value.localScale = ["x", "y", "z"].map((k) => Number(scale.field(k).value));
        const world = call(transform, "get_lossyScale");
        value.worldScale = ["x", "y", "z"].map((k) => Number(world.field(k).value));
        value.parents = [];
        for (let node = call(transform, "get_parent"), depth = 0; depth < 4 && !isNull(node); depth++, node = call(node, "get_parent")) {
          const scale2 = call(node, "get_localScale");
          value.parents.push({ name: String(call(node, "get_name")?.content || "").slice(0, 80), scale: ["x", "y", "z"].map((k) => Number(scale2.field(k).value)) });
        }
        const rect = call(transform, "get_rect");
        value.rect = [Number(rect.field("m_Width").value), Number(rect.field("m_Height").value)];
        const canvas = go.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
        if (!isNull(canvas)) value.canvasScale = Number(call(canvas, "get_scaleFactor"));
      } catch (_) {
      }
      trace("sample", value);
    }
    const seen = /* @__PURE__ */ new Set();
    for (const method of ucls("UnityEngine.Screen").methods.filter((m) => m.name === "SetResolution" && m.isStatic && m.parameterCount >= 2)) {
      const key = method.virtualAddress.toString();
      if (method.virtualAddress.isNull() || seen.has(key)) continue;
      seen.add(key);
      if (![3, 4].includes(method.parameterCount) || method.parameters[2].type.name !== "System.Boolean") continue;
      method.implementation = function(...values) {
        const settings = Boolean(root) && Date.now() < watchUntil || resourceSettingsOpen();
        let skip = false;
        try {
          const screen = chatScreen();
          skip = redundantSettingsResolution(values, {
            width: screen.width,
            height: screen.height,
            fullscreen: null
          }, settings);
        } catch (_) {
        }
        watchUntil = Date.now() + 2e3;
        trace(skip ? "SetResolution-skipped" : "SetResolution", {
          width: values[0],
          height: values[1],
          fullscreen: values[2],
          refreshRate: values.length === 4 ? values[3] : null,
          signature: method.parameters.map((p) => p.type.name).join(",")
        });
        if (skip) return;
        return method.invoke(...values);
      };
    }
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, { onLeave() {
      try {
        const now = Date.now();
        if (resourceSettingsOpen() && Number(ucls("UnityEngine.Input").method("get_touchCount", 0).invoke()) > 0) {
          watchUntil = now + 2e3;
          if (!root) root = resourceSettingsWindow.target.ref(false);
        }
        if (now < watchUntil) capture();
        else if (root) {
          root.free();
          root = null;
        }
      } catch (_) {
      }
    } });
    log(`settings display: observing ${seen.size} resolution methods; per-frame samples after Settings touch`);
  });
  let unityLogCallbackRef = null;
  section("persistent Unity errors", () => {
    const application = ucls("UnityEngine.Application");
    const subscribe = application.tryMethod("add_logMessageReceivedThreaded", 1);
    if (subscribe && !subscribe.virtualAddress.isNull()) {
      const delegate = Il2Cpp.delegate(subscribe.parameters[0].type.class, (message, stack, value) => {
        const kind = enumVal(value);
        if ([0, 1, 2, 4].includes(kind)) log(`Unity ${kind}: ${message?.content || ""}
${stack?.content || ""}`);
      });
      unityLogCallbackRef = delegate.ref(false);
      subscribe.invoke(delegate);
      return;
    }
    const callback = application.tryMethod("CallLogCallback", 4);
    if (!callback || !callback.isStatic || callback.virtualAddress.isNull()) return;
    hookAttach(callback.virtualAddress, { onEnter(args) {
      const kind = args[2].toInt32();
      if (![0, 1, 2, 4].includes(kind)) return;
      try {
        const message = args[0].isNull() ? "" : new Il2Cpp.String(args[0]).content || "";
        const stack = args[1].isNull() ? "" : new Il2Cpp.String(args[1]).content || "";
        log(`Unity ${kind}: ${message}
${stack}`);
      } catch (_) {
      }
    } });
  });
  const LEGACY_TEST_FEED = "https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  const MAIN_TEST_FEED = "https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  function migrateUpdateChannel(io) {
    let config;
    try {
      config = JSON.parse(io.read() || "null");
    } catch (_) {
      return "unreadable";
    }
    if (!config || typeof config !== "object" || config.feedUrl !== LEGACY_TEST_FEED) return "unchanged";
    config.feedUrl = MAIN_TEST_FEED;
    return io.write(JSON.stringify(config)) ? "migrated" : "write-failed";
  }
  section("Reborn Android updater and diagnostics", () => {
    try {
      const path = `${persistentPath()}/tesl-reborn-updater.json`;
      const result = migrateUpdateChannel({
        read: () => readTextFile(path),
        write: (text) => writeTextFile(path + ".part", text) && atomicRename(path + ".part", path)
      });
      if (result !== "unchanged") log(`updater: channel migration ${result}${result === "migrated" ? " to the main repository test branch" : ""}`);
    } catch (error) {
      log(`updater: channel migration failed: ${error}`);
    }
    const uriClass = ucls("System.Uri");
    log(`HTTP URI assembly: ${uriClass.image.name}`);
    log("Android feature hooks are active; server data and UI results are checked separately");
    const updater = globalThis.TeslRebornUpdater;
    if (updater) {
      updater.ready();
      try {
        installUpdateNotices(updater);
      } catch (error) {
        log(`update notices unavailable: ${error}`);
        schedule(1e3, () => updater.check((url, cb) => httpGet(url, false, cb, true)));
      }
    }
  });
  log("setup finished");
});
