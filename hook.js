📦
206074 /hook.js
126082 /hook.js.map
✄
// node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/index.js
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
var CONFIG_LOCAL = "http://localhost:3000/config.json";
var CONFIG_URL = "https://tesl-reborn.com/config.json";
var PLUGIN_VERSION = "1.3.1-beta";
var COMPONENT_TYPE = "win";
var LOGIN_PLATFORM = "Steam";
var MAJOR_VERSION = "db-630167952";
var CHANGELIST = "317259";
var TAG = "[tesl-hook]";
var PROGRESS_BYTES = 256 * 1024 * 1024;
var androidLogWrite = null;
try {
  androidLogWrite = new NativeFunction(
    Process.getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int",
    ["int", "pointer", "pointer"]
  );
} catch (e) {
  console.log(`${TAG} no liblog: ${e}`);
}
var tagPtr = Memory.allocUtf8String("tesl-hook");
var log = (m, prio = 4) => {
  console.log(`${TAG} ${m}`);
  try {
    androidLogWrite?.(prio, tagPtr, Memory.allocUtf8String(m.length > 900 ? m.slice(0, 900) + "..." : m));
  } catch (_) {
  }
};
var SECRET_JSON = /("(?:password|encryptedAppTicket|token|sessionToken)"\s*:\s*")(?:[^"\\]|\\.)*"/g;
var SECRET_HEADER = /((?:authorization|token|sessiontoken)\s*:\s*)[^\r\n]*/gi;
var maskSecrets = (t) => t.replace(SECRET_JSON, '$1***"').replace(SECRET_HEADER, "$1***");
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
function enumVal(v) {
  if (v == null) return -1;
  if (typeof v === "number") return v;
  try {
    return Number(v.field("value__").value);
  } catch (_) {
    return -1;
  }
}
function invokeDelegateInt(del, value) {
  new Il2Cpp.Object(del.handle).method("Invoke").invoke(value);
}
function nested(image, outer, inner) {
  const c = image.classes.find((k) => k.name === inner && k.declaringClass?.name === outer);
  if (!c) throw new Error(`class ${outer}/${inner} not found`);
  return c;
}
function channelFrom(settings) {
  try {
    if (settings && !settings.handle.isNull()) {
      const names = settings.field("_channelNames").value;
      const idx = enumVal(settings.field("_channel").value);
      if (idx < 0) throw new Error("the channel field is unreadable");
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
    return maskSecrets(t);
  } catch (e) {
    return `(unreadable: ${e})`;
  }
}
var OVERRIDES_PATH = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-hook.json";
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
function section(name, fn, critical = false) {
  try {
    fn();
    log(`OK   ${name}`);
  } catch (e) {
    if (critical) log(`FAIL ${name}: ${e} - login will not work without this section`, 6);
    else log(`FAIL ${name}: ${e}`);
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
  new Il2Cpp.Object(del.handle).method("Invoke").invoke(value);
}
var CREATE_ACCOUNT = false;
Il2Cpp.perform(() => {
  const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  log(`attached, Unity ${Il2Cpp.unityVersion}, hook build plugin-parity-7`);
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
    body.field("language").value = language;
    body.field("steamId").value = Il2Cpp.string("");
    body.field("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLogin.invoke(body, endpoint, Il2Cpp.string("bnetSteamLogin"), NULL, cb);
  }
  function sendLink(sessionAuth, language, settings, endpoint, cb) {
    const body = linkReq.new();
    fillBase(body, channelFrom(settings));
    body.field("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field("language").value = language;
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
  }, true);
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
  }, true);
  const overrides = loadOverrides();
  const byteClass = Il2Cpp.corlib.class("System.Byte");
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
      const obj = JSON.parse(decodeURIComponent(escape(bin)));
      if (typeof obj !== "object" || obj === null || !("componentType" in obj)) {
        log(`normalizer: ${uri.split("/").pop()} has no componentType`);
        return;
      }
      const changed = [];
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
      const out = unescape(encodeURIComponent(JSON.stringify(obj)));
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
      let text = "";
      for (let i = 0; i < length; i++) text += String.fromCharCode(Number(raw.get(i)));
      const body = JSON.parse(decodeURIComponent(escape(text)));
      if (body && body.username) pendingLogin = { username: String(body.username), password: String(body.password ?? "") };
    } catch (e) {
      log(`could not read the login: ${e}`);
    }
  }
  section("config redirect", () => {
    Interceptor.attach(cls(img, "SparkleServices.FetchConfig").method("StartProcess").virtualAddress, {
      onEnter(args) {
        args[1] = Il2Cpp.string(CONFIG_LOCAL).handle;
        args[2] = Il2Cpp.string(CONFIG_URL).handle;
        args[3] = ptr(1);
        log("FetchConfig.StartProcess redirected");
      }
    });
  });
  section("http caching", () => {
    Interceptor.attach(cls(img, "BestHTTP.HTTPManager").method("get_IsCachingDisabled").virtualAddress, {
      onLeave(ret) {
        ret.replace(ptr(0));
      }
    });
  });
  let dumpingHeaders = false;
  section("http header", () => {
    let seen = 0;
    const m = cls(img, "BestHTTP.HTTPRequest").method("EnumerateHeaders", 2);
    Interceptor.attach(m.virtualAddress, {
      onEnter(args) {
        if (dumpingHeaders) return;
        try {
          const req = new Il2Cpp.Object(args[0]);
          let has = false;
          try {
            has = Boolean(call(req, "HasHeader", Il2Cpp.string("X-TeslRebornPlugin-Version")));
          } catch (_) {
          }
          if (!has) req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
          const uri = String(call(req, "get_Uri"));
          captureLogin(req, uri);
          rewriteAuthBody(req, uri);
          if (seen++ < 60) log(`-> ${uri} body: ${bodyOf(req)}`);
        } catch (e) {
          log(`header hook error: ${e}`);
        }
      }
    });
  });
  section("http trace", () => {
    let seen = 0;
    Interceptor.attach(cls(img, "BestHTTP.HTTPRequest").method("CallCallback").virtualAddress, {
      onEnter(args) {
        const verbose = seen++ <= 80;
        if (!verbose && !pendingLogin) return;
        try {
          const req = new Il2Cpp.Object(args[0]);
          const uri = String(call(req, "get_Uri"));
          const state = String(call(req, "get_State"));
          const resp = call(req, "get_Response");
          let info = "no response";
          let status = 0;
          let text = "";
          if (resp && !resp.handle.isNull()) {
            const code = Number(call(resp, "get_StatusCode"));
            status = code;
            try {
              text = String(call(resp, "get_DataAsText")?.content ?? "");
            } catch (_) {
            }
            info = `status ${code} body: ${maskSecrets(text).replace(/\s+/g, " ").slice(0, 300)}`;
          } else {
            try {
              info = `exception: ${call(req, "get_Exception")}`;
            } catch (_) {
            }
          }
          if (verbose) {
            let sent = "";
            dumpingHeaders = true;
            try {
              sent = ` sent-headers: ${maskSecrets(String(call(req, "DumpHeaders"))).replace(/\s+/g, " ").slice(0, 300)}`;
            } catch (_) {
            } finally {
              dumpingHeaders = false;
            }
            log(`<- ${state} ${uri} ${info}${sent}`);
          }
          if (pendingLogin && uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
            let resultCode = null;
            let hasToken = false;
            try {
              const json = JSON.parse(text);
              if (typeof json?.resultCode === "number") resultCode = json.resultCode;
              hasToken = typeof json?.data?.token === "string" && json.data.token.length > 0;
            } catch (_) {
            }
            if (status === 200 && (resultCode === 0 || resultCode === null && hasToken)) {
              writeSavedLogin(pendingLogin.username, pendingLogin.password);
              loginRejected = false;
            } else if (status === 200 && resultCode !== null) {
              clearSavedLogin();
              loginRejected = true;
              log(`the service rejected the login (resultCode ${resultCode}), the saved credentials are dropped`);
            } else if (status === 0) {
              log("the login request got no response, the saved credentials are unchanged");
            } else {
              log(`the login answer is not understood (HTTP ${status}), the saved credentials are unchanged`);
            }
            pendingLogin = null;
          }
        } catch (e) {
          log(`trace error: ${e}`);
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
    const m = k.methods.find((x) => x.name.endsWith(suffix) && !/^(add|remove|set|get)_/.test(x.name) && x.parameterCount >= minParams);
    if (!m) throw new Error(`${full}::${suffix} not found`);
    return m;
  };
  section("error tracing: ErrorHandler.OnError", () => {
    Interceptor.attach(byName("ErrorHandler", "OnError", 4).virtualAddress, {
      onEnter(args) {
        log(`ErrorHandler.OnError code=${args[1].toInt32()} endpoint=${strOf(args[2])}`);
      }
    });
  });
  section("error tracing: websocket transport", () => {
    const wt = "BestHTTP.SocketIO.Transports.WebSocketTransport";
    Interceptor.attach(byName(wt, "OnOpen").virtualAddress, { onEnter() {
      log("ws transport: open");
    } });
    Interceptor.attach(byName(wt, "OnError").virtualAddress, { onEnter(args) {
      log(`ws transport: ERROR ${msgOf(args[2])}`);
    } });
    Interceptor.attach(byName(wt, "OnClosed").virtualAddress, {
      onEnter(args) {
        log(`ws transport: closed code=${args[2].toInt32() & 65535} msg=${strOf(args[3])}`);
      }
    });
  });
  section("error tracing: socket.io manager", () => {
    const sm = "BestHTTP.SocketIO.SocketManager";
    Interceptor.attach(byName(sm, "OnTransportConnected").virtualAddress, { onEnter() {
      log("socket.io: transport connected");
    } });
    Interceptor.attach(byName(sm, "OnTransportError").virtualAddress, { onEnter(args) {
      log(`socket.io: transport error ${strOf(args[2])}`);
    } });
    Interceptor.attach(byName(sm, "EmitError").virtualAddress, { onEnter(args) {
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
    Interceptor.attach(byName("AssetBundles.AssetBundleManager", "LoadAssetBundleInternal").virtualAddress, {
      onEnter() {
        inLoad = true;
      },
      onLeave() {
        inLoad = false;
      }
    });
    let once = 0;
    Interceptor.attach(byName("PlatformUtils", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) {
        if (inLoad) {
          ret.replace(ptr(0));
          if (once++ < 3) log("PlatformUtils.PlatformDownloadsBundles -> false (manifest from OBB)");
        }
      }
    });
    let once2 = 0;
    Interceptor.attach(byName("AssetCatalog", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) {
        ret.replace(ptr(0));
        if (once2++ < 3) log("AssetCatalog.PlatformDownloadsBundles -> false (no CDN download)");
      }
    });
    try {
      let seenLocal = 0;
      const mgr = cls(img, "AssetBundles.AssetBundleManager");
      Interceptor.attach(mgr.method("SetSourceAssetBundleURL").virtualAddress, {
        onEnter(args) {
          log(`AssetBundleManager.SetSourceAssetBundleURL("${rawStr(args[1])}")`);
        }
      });
      const local = cls(img, "AssetBundles.AssetBundleLoadFromLocalOperation");
      Interceptor.attach(local.method(".ctor", 1).virtualAddress, {
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
    Interceptor.attach(init.virtualAddress, {
      onEnter(args) {
        try {
          let versionInfo = null;
          const remote = catalog.field("_remoteBundleVersionInfo").value;
          if (className(remote) === "BundleVersionInfo") versionInfo = remote;
          if (!versionInfo) {
            log("storage modes: no version info found in AssetCatalog._remoteBundleVersionInfo");
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
    Interceptor.attach(m.virtualAddress, {
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
    Interceptor.attach(setDelay.virtualAddress, {
      onEnter(args) {
        const delay = args[2].toInt32();
        if (delay < MAX_DELAY) {
          log(`Cache.expirationDelay ${delay} -> ${MAX_DELAY}`);
          args[2] = ptr(MAX_DELAY);
        }
      }
    });
    let cleared = 0;
    Interceptor.attach(caching.method("ClearCachedVersion", 2).virtualAddress, {
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
    const o = klass.alloc();
    o.method(".ctor", args.length).invoke(...args);
    return o;
  }
  function isNull(o) {
    return !o || !o.handle || o.handle.isNull();
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
  function enumBox(enumClass, n) {
    const boxed = enumClass.alloc();
    boxed.field("value__").value = n;
    return boxed.unbox();
  }
  function vec2(x, y) {
    const boxed = ucls("UnityEngine.Vector2").alloc();
    boxed.field("x").value = x;
    boxed.field("y").value = y;
    return boxed.unbox();
  }
  function color(r, g, b, a) {
    const boxed = ucls("UnityEngine.Color").alloc();
    boxed.field("r").value = r;
    boxed.field("g").value = g;
    boxed.field("b").value = b;
    boxed.field("a").value = a;
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
  function httpGet(url, withAuth, cb) {
    const done = (status, body) => {
      if (status === -1) log(`http GET ${url} failed: ${body}`);
      cb(status, body);
    };
    try {
      const uriClass = Il2Cpp.corlib.tryClass("System.Uri") ?? Il2Cpp.domain.assembly("System").image.class("System.Uri");
      const uri = newWith(uriClass, Il2Cpp.string(url));
      const del = Il2Cpp.delegate(cls(img, "BestHTTP.OnRequestFinishedDelegate"), (req2, resp) => {
        try {
          if (isNull(resp)) {
            let why = "no response";
            try {
              why += `, state ${call(req2, "get_State")}, exception ${call(req2, "get_Exception")}`;
            } catch (_) {
            }
            done(-1, why);
            return;
          }
          const status = Number(call(resp, "get_StatusCode"));
          let body = "";
          try {
            body = String(call(resp, "get_DataAsText")?.content ?? "");
          } catch (_) {
          }
          cb(status, body);
        } catch (e) {
          done(-1, String(e));
        }
      });
      const requestClass = cls(img, "BestHTTP.HTTPRequest");
      const req = requestClass.alloc();
      const ctor = requestClass.methods.find((m) => m.name === ".ctor" && m.parameterCount === 3 && /HTTPMethods$/.test(String(m.parameters[1]?.type?.name)));
      let built = false;
      if (ctor) {
        try {
          ctor.bind(req).invoke(uri, 0, del);
          built = true;
        } catch (e) {
          log(`http GET: the 3-parameter constructor failed (${e}), using the 2-parameter one`);
        }
      }
      if (!built) req.method(".ctor", 2).invoke(uri, del);
      req.method("AddHeader").invoke(Il2Cpp.string("Accept"), Il2Cpp.string("application/json"));
      if (withAuth) {
        const token = authToken();
        if (token) req.method("AddHeader").invoke(Il2Cpp.string("Authorization"), Il2Cpp.string("Bearer " + token));
        else log(`http GET ${url}: no auth token yet, sent without Authorization`);
      }
      req.method("Send").invoke();
    } catch (e) {
      done(-1, String(e));
    }
  }
  section("rewards refresh", () => {
    const pubSub = cls(img, "SparkleServices.PubSub");
    const createPush = pubSub.method("CreatePushNotification");
    const gameNetwork = cls(img, "SPTESL.GameNetworkManager");
    Interceptor.attach(cls(img, "EndGameState").method("OnEnable").virtualAddress, {
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
    Interceptor.attach(cls(img, "SoloArena").method("SoloArenaEndSequence").virtualAddress, {
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
  const pending = [];
  function schedule(delayMs, fn) {
    pending.push({ at: Date.now() + delayMs, fn });
  }
  function runPending() {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at > now) continue;
      const task = pending.splice(i, 1)[0];
      try {
        Il2Cpp.mainThread.schedule(() => {
          try {
            task.fn();
          } catch (e) {
            log(`scheduled task failed: ${e}`);
          }
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
    Interceptor.attach(update.virtualAddress, { onEnter() {
      runPending();
    } });
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
        log(`match history: ${matchEntryData.length} entries`);
      } catch (e) {
        log(`fetchExtendedData parse error: ${e}`);
      }
    });
  }
  section("stats and deck statistics", () => {
    Interceptor.attach(cls(img, "SparkleServices.Stats").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field("resultCode").value) !== 0) return;
          refreshMatchEntries();
        } catch (e) {
          log(`stats hook failed: ${e}`);
        }
      }
    });
    Interceptor.attach(cls(img, "SparkleServices.Inventory").method("OnResponse").virtualAddress, {
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
      Interceptor.attach(method.virtualAddress, {
        onLeave() {
          schedule(1e3, () => refreshDeckStats(true));
        }
      });
    }
  });
  const deckTiles = /* @__PURE__ */ new Set();
  function refreshDeckTileLabels() {
    for (const key of Array.from(deckTiles)) {
      try {
        const tile = new Il2Cpp.Object(ptr(key));
        if (tile.class.name !== "DeckTile") {
          deckTiles.delete(key);
          continue;
        }
        updateDeckTileLabel(tile);
      } catch (_) {
        deckTiles.delete(key);
      }
    }
  }
  function updateDeckTileLabel(tile) {
    try {
      const transform = call(tile, "get_transform");
      if (isNull(transform)) return;
      const container = call(transform, "Find", Il2Cpp.string("WinLossRatioContainer"));
      if (isNull(container)) return;
      const labelTransform = call(container, "Find", Il2Cpp.string("WinLossRatioLabel"));
      if (isNull(labelTransform)) return;
      const label = labelTransform.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.Text").type.object);
      if (isNull(label)) return;
      const stats = deckStats.get(Number(call(tile, "GetDeckId")));
      const text = stats ? `${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)` : "";
      label.method("set_text").invoke(Il2Cpp.string(text));
      if (stats) {
        const containerRect = container.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.RectTransform").type.object);
        const width = Number(call(label, "get_preferredWidth")) + 10;
        const height = Number(call(label, "get_preferredHeight")) + 5;
        if (!isNull(containerRect)) containerRect.method("set_sizeDelta").invoke(vec2(width, height));
      }
      const labelObject = call(labelTransform, "get_gameObject");
      if (!isNull(labelObject)) labelObject.method("SetActive").invoke(stats != null);
    } catch (e) {
      log(`deck tile label failed: ${e}`);
    }
  }
  let labelSizeLogged = false;
  function createDeckTileLabel(tile) {
    try {
      const nameText = tile.field("DeckNameText").value;
      if (isNull(nameText)) return;
      const parent = call(tile, "get_transform");
      if (isNull(parent)) return;
      const gameObject = ucls("UnityEngine.GameObject");
      const rectType = ucls("UnityEngine.RectTransform");
      const container = newWith(
        gameObject,
        Il2Cpp.string("WinLossRatioContainer"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object])
      );
      const containerTransform = call(container, "get_transform");
      containerTransform.method("SetParent", 2).invoke(parent, false);
      const containerRect = container.method("GetComponent").overload("System.Type").invoke(rectType.type.object);
      if (!isNull(containerRect)) {
        containerRect.method("set_anchorMin").invoke(vec2(1, 0));
        containerRect.method("set_anchorMax").invoke(vec2(1, 0));
        containerRect.method("set_pivot").invoke(vec2(1, 0));
        containerRect.method("set_anchoredPosition").invoke(vec2(-3, 2));
      }
      const background = newWith(
        gameObject,
        Il2Cpp.string("Background"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object])
      );
      const backgroundTransform = call(background, "get_transform");
      backgroundTransform.method("SetParent", 2).invoke(containerTransform, false);
      const backgroundImage = background.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.Image").type.object);
      const backgroundRect = background.method("GetComponent").overload("System.Type").invoke(rectType.type.object);
      if (!isNull(backgroundRect)) {
        backgroundRect.method("set_anchorMin").invoke(vec2(0, 0));
        backgroundRect.method("set_anchorMax").invoke(vec2(1, 1));
        backgroundRect.method("set_sizeDelta").invoke(vec2(0, 0));
        backgroundRect.method("set_anchoredPosition").invoke(vec2(0, 0));
      }
      if (!isNull(backgroundImage)) {
        backgroundImage.method("set_color").invoke(color(0, 0, 0, 0.7));
        backgroundImage.method("set_raycastTarget").invoke(false);
      }
      const objectClass = ucls("UnityEngine.Object");
      const instantiate = objectClass.methods.find((m) => m.name === "Instantiate" && !m.isGeneric && m.parameterCount === 3 && /Transform$/.test(String(m.parameters[1]?.type?.name))) ?? objectClass.method("Instantiate", 3);
      const label = instantiate.invoke(nameText, containerTransform, false);
      if (isNull(label)) return;
      label.method("set_name").invoke(Il2Cpp.string("WinLossRatioLabel"));
      label.method("set_alignment").invoke(5);
      const nameSize = Number(call(label, "get_fontSize"));
      const labelSize = Math.max(16, Math.round(nameSize * 1.3));
      if (!labelSizeLogged) {
        labelSizeLogged = true;
        log(`deck tile label font size ${nameSize} -> ${labelSize}`);
      }
      label.method("set_fontSize").invoke(labelSize);
      label.method("set_horizontalOverflow").invoke(1);
      label.method("set_verticalOverflow").invoke(1);
      label.method("set_raycastTarget").invoke(false);
      const labelRect = call(label, "get_rectTransform");
      if (!isNull(labelRect)) {
        labelRect.method("set_anchorMin").invoke(vec2(0, 0));
        labelRect.method("set_anchorMax").invoke(vec2(1, 1));
        labelRect.method("set_pivot").invoke(vec2(0.5, 0.5));
        labelRect.method("set_anchoredPosition").invoke(vec2(0, 0));
        labelRect.method("set_sizeDelta").invoke(vec2(0, 0));
        labelRect.method("set_offsetMin").invoke(vec2(5, 2.5));
        labelRect.method("set_offsetMax").invoke(vec2(-5, -2.5));
      }
      const labelObject = call(label, "get_gameObject");
      if (!isNull(labelObject)) labelObject.method("SetActive").invoke(false);
    } catch (e) {
      log(`deck tile label creation failed: ${e}`);
    }
  }
  section("deck tile win/loss label", () => {
    const deckTile = cls(img, "DeckTile");
    Interceptor.attach(deckTile.method("SetData", 2).virtualAddress, {
      onEnter(args) {
        try {
          this.tile = args[0];
          const tile = new Il2Cpp.Object(args[0]);
          deckTiles.add(tile.handle.toString());
          const transform = call(tile, "get_transform");
          if (isNull(transform)) return;
          const container = call(transform, "Find", Il2Cpp.string("WinLossRatioContainer"));
          if (isNull(container)) createDeckTileLabel(tile);
        } catch (e) {
          log(`deck tile setdata failed: ${e}`);
        }
      },
      onLeave() {
        try {
          if (!this.tile) return;
          updateDeckTileLabel(new Il2Cpp.Object(this.tile));
        } catch (_) {
        }
      }
    });
    Interceptor.attach(deckTile.method("Awake").virtualAddress, {
      onEnter(args) {
        this.tile = args[0];
      },
      onLeave() {
        try {
          deckTiles.add(this.tile.toString());
        } catch (_) {
        }
      }
    });
    for (const name of ["OnDisable", "OnDestroy"]) {
      const gone = deckTile.methods.find((x) => x.name === name && x.parameterCount === 0);
      if (gone) Interceptor.attach(gone.virtualAddress, { onEnter(args) {
        deckTiles.delete(args[0].toString());
      } });
      else log(`deck tiles: DeckTile.${name} not found, stored tile pointers are not cleared by it`);
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
        Interceptor.attach(moveNext.virtualAddress, {
          onLeave(retval) {
            retval.replace(ptr(0));
          }
          // finish the coroutine at once
        });
      }
    } else log("news: the game's news coroutine was not found");
    Interceptor.attach(widget.method("OnEnable").virtualAddress, {
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
    Interceptor.attach(moveNext.virtualAddress, {
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
      for (const name of [code, code === "en" ? "en_US" : code]) {
        text = readTextFile(`${persistentPath()}/tesl-localization-${name}.json`);
        if (text) break;
      }
      if (!text) return 0;
      const json = JSON.parse(text);
      const keys = Object.keys(json);
      if (keys.length === 0) return 0;
      const stringClass = Il2Cpp.corlib.class("System.String");
      const dictionary = Il2Cpp.corlib.class("System.Collections.Generic.Dictionary`2").inflate(stringClass, stringClass).new();
      for (const key of keys) {
        dictionary.method("set_Item").invoke(Il2Cpp.string(key), Il2Cpp.string(String(json[key])));
      }
      manager.field("_localizedData").value = dictionary;
      return keys.length;
    } catch (e) {
      log(`could not restore the localization: ${e}`);
      return 0;
    }
  }
  section("translation fixes", () => {
    const localization = cls(img, "LocalizationManager");
    let lastLanguage = "";
    let lastApplied = "";
    Interceptor.attach(localization.method("SetLanguage", 2).virtualAddress, {
      onEnter(args) {
        log(`LocalizationManager.SetLanguage called`);
      }
    });
    Interceptor.attach(localization.method("UpdateObjects").virtualAddress, {
      onEnter(args) {
        try {
          const manager = new Il2Cpp.Object(args[0]);
          const code = String(call(manager, "get_CurrentLanguageCode")?.content ?? "en");
          let data = manager.field("_localizedData").value;
          let entries = countOf(data);
          if (entries === 0) {
            const restored = restoreLocalization(manager, code);
            if (restored > 0) log(`localization: restored ${restored} strings from ${code}`);
            data = manager.field("_localizedData").value;
            entries = countOf(data);
          }
          const fixes = TRANSLATIONS[code];
          if (lastLanguage !== code) {
            lastLanguage = code;
            log(`localization: language ${code}, ${entries} strings${fixes ? "" : ", no fixes for it"}`);
          }
          if (!fixes) return;
          if (isNull(data)) return;
          const appliedFor = `${code}:${data.handle}`;
          if (appliedFor === lastApplied) return;
          lastApplied = appliedFor;
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
    file = null;
    entries = /* @__PURE__ */ new Map();
    ok = false;
    // false when the archive could not be read (already logged)
    constructor(path) {
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
        this.ok = true;
      } catch (e) {
        log(`payload: the apk cannot be read: ${e}`);
        this.close();
      }
    }
    close() {
      try {
        this.file?.close();
      } catch (_) {
      }
      this.file = null;
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
    // Writes to <target>.part and renames when complete, so a killed copy never leaves a truncated file under the final name.
    copy(entry, target) {
      if (entry.method !== 0) throw new Error(`entry for ${target} is not stored (method ${entry.method})`);
      const part = `${target}.part`;
      const out = new File(part, "wb");
      try {
        let done = 0;
        let reported = 0;
        while (done < entry.size) {
          const n = Math.min(4 * 1024 * 1024, entry.size - done);
          out.write(this.read(entry, done, n));
          done += n;
          if (done - reported >= PROGRESS_BYTES && done < entry.size) {
            reported = done;
            log(`payload: ${target.split("/").pop()} ${Math.floor(done / 1048576)} of ${Math.floor(entry.size / 1048576)} MB`);
          }
        }
        out.close();
      } catch (e) {
        try {
          out.close();
        } catch (_) {
        }
        throw e;
      }
      moveFile(part, target);
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
    try {
      if (!zip.ok) return;
      const obb = zip.find("assets/tesl-payload/obb.bin");
      const cache = zip.find("assets/tesl-payload/cache.bin");
      const perFileEntries = zip.list().filter((e) => e.startsWith("assets/tesl-payload/UnityCache/Shared/"));
      if (!obb && !cache && !perFileEntries.length) {
        log("payload: the apk carries no payload");
        return;
      }
      if (obb) {
        const target = obbPath();
        const have = target ? fileLength(target) : -1;
        if (target && have !== obb.size) {
          log(`payload: writing the streaming assets to ${target}${have >= 0 ? ` (found ${have} of ${obb.size} bytes)` : ""}`);
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
          let failed = 0;
          let bytes = 0;
          let reported = 0;
          for (const name of perEntry) {
            const rel = name.substring(prefix.length);
            const path = `${tgt}/${rel}`;
            const e = zip.find(name);
            if (fileLength(path) === e.size) continue;
            try {
              makeDirectory(path.substring(0, path.lastIndexOf("/")));
              zip.copy(e, path);
              written++;
              bytes += e.size;
              if (bytes - reported >= PROGRESS_BYTES) {
                reported = bytes;
                log(`payload: ${written} cache files written, ${Math.floor(bytes / 1048576)} MB`);
              }
            } catch (err) {
              failed++;
              log(`payload: cache file ${rel} failed: ${err}`);
            }
          }
          log(`payload: ${written} of ${perEntry.length} cache files written (per-file)${failed ? `, ${failed} failed` : ""}`);
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
  function fileExists(path) {
    try {
      return Boolean(Il2Cpp.corlib.class("System.IO.File").method("Exists").invoke(Il2Cpp.string(path)));
    } catch (_) {
      return false;
    }
  }
  function fileLength(path) {
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
  function moveFile(from, to) {
    const file = Il2Cpp.corlib.class("System.IO.File");
    file.method("Delete").invoke(Il2Cpp.string(to));
    file.method("Move", 2).invoke(Il2Cpp.string(from), Il2Cpp.string(to));
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
  let loginRejected = false;
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
    if (writeTextFile(path, JSON.stringify({ username, password }))) {
      log(`remembered the login of ${username}`);
    }
  }
  function clearSavedLogin() {
    try {
      Il2Cpp.corlib.class("System.IO.File").method("Delete").invoke(Il2Cpp.string(`${persistentPath()}/${LOGIN_FILE}`));
    } catch (_) {
    }
  }
  section("auto login", () => {
    const credentials = cls(img, "SparkleServices.UsernameAndPassword");
    const useRemembered = (callback, saved) => {
      autoLoginTried = true;
      log(`auto login as ${saved.username}`);
      schedule(250, () => {
        try {
          const value = credentials.alloc();
          value.field("username").value = Il2Cpp.string(saved.username);
          value.field("password").value = Il2Cpp.string(saved.password);
          new Il2Cpp.Object(callback).method("Invoke").invoke(value.unbox());
        } catch (e) {
          log(`auto login failed: ${e}`);
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
        const saved = autoLoginTried ? null : readSavedLogin();
        if (!saved) {
          if (autoLoginTried) {
            autoLoginTried = false;
            log(loginRejected ? "auto login was rejected, showing the login window" : "login window requested after an auto login, showing it");
            loginRejected = false;
          }
          mobileOriginal(this.handle, title, description, callback);
          return;
        }
        useRemembered(callback, saved);
      } catch (e) {
        log(`auto login error: ${e}`);
        mobileOriginal(this.handle, title, description, callback);
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
        const saved = autoLoginTried ? null : readSavedLogin();
        if (!saved) {
          if (autoLoginTried) {
            autoLoginTried = false;
            log(loginRejected ? "auto login was rejected, showing the login window" : "login window requested after an auto login, showing it");
            loginRejected = false;
          }
          fallbackOriginal(title, description, callback);
          return;
        }
        useRemembered(callback, saved);
      } catch (e) {
        log(`auto login error: ${e}`);
        fallbackOriginal(title, description, callback);
      }
    };
  });
  section("tesl reborn credits", () => {
    const credits = cls(img, "CreditsLoader");
    const lineData = cls(img, "CreditsWin").nested("LineDisplayData");
    Interceptor.attach(credits.method("LoadCreditsForDisplay").virtualAddress, {
      onEnter(args) {
        try {
          const list = new Il2Cpp.Object(args[0]);
          for (const [type, text] of [
            [CREDIT_GROUP, "TESL Reborn Team"],
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
    Interceptor.attach(cls(img, "UIResourceManager").method("GetTitleBannerSprite").virtualAddress, {
      onEnter(args) {
        if (args[1].toInt32() !== RARITY_LEGENDARY) return;
        args[1] = ptr(0);
        log("UIResourceManager: legendary title banner -> common");
      }
    });
  });
  section("player profile titles (legendary filter)", () => {
    const ppt = cls(img, "PlayerProfileTitles");
    Interceptor.attach(ppt.method("Awake").virtualAddress, {
      onEnter(args) {
        try {
          const self = new Il2Cpp.Object(args[0]);
          const t = call(self, "get_transform");
          if (isNull(t)) return;
          const found = call(t, "Find", Il2Cpp.string("Layout_Filters/Widget_Filters_Rarity/KEEP_HIDDEN_Item_Filter_Legendary"));
          if (isNull(found)) return;
          const go = call(found, "get_gameObject");
          if (!isNull(go)) go.method("SetActive").invoke(true);
          log("PlayerProfileTitles: revealed the legendary rarity filter");
        } catch (e) {
          log(`player profile titles awake failed: ${e}`);
        }
      }
    });
  });
  section("player profile title item (legendary colour)", () => {
    const ppti = cls(img, "PlayerProfileTitleItem");
    Interceptor.attach(ppti.method("UpdateUi").virtualAddress, {
      onEnter(args) {
        this.self = args[0];
      },
      onLeave() {
        try {
          const self = new Il2Cpp.Object(this.self);
          const titleData = self.field("_titleData").value;
          if (isNull(titleData)) return;
          const rarity = enumVal(titleData.field("Rarity").value);
          if (rarity !== RARITY_LEGENDARY) return;
          const bg = self.field("BackgroundImage").value;
          if (isNull(bg)) return;
          const uiRes = ucls("UIResourceManager").method("get_Instance").invoke();
          if (!isNull(uiRes)) {
            const sprite = uiRes.method("GetTitleBannerSprite").invoke(enumBox(cls(img, "SPTESL.CardRarity"), RARITY_LEGENDARY));
            if (!isNull(sprite)) bg.method("set_overrideSprite").invoke(sprite);
          }
          bg.method("set_color").invoke(1, 0.75, 0, 1);
          log("PlayerProfileTitleItem: coloured a legendary title");
        } catch (e) {
          log(`player profile title item update failed: ${e}`);
        }
      }
    });
  });
  section("player info panel (legendary title banner)", () => {
    const pip = cls(img, "PlayerInfoPanel");
    Interceptor.attach(pip.method("UpdateUi").virtualAddress, {
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
            commonBanner.method("set_color").invoke(1, 0.75, 0, 1);
          }
        } catch (e) {
          log(`player info panel update failed: ${e}`);
        }
      }
    });
  });
  section("localization asset trace", () => {
    const catalog = cls(img, "AssetCatalog");
    let logged = 0;
    for (const m of catalog.methods.filter((x) => x.name === "LoadAssetFromPathAsync")) {
      Interceptor.attach(m.virtualAddress, {
        onEnter(args) {
          if (logged < 40) this.path = rawStr(args[1]);
        },
        onLeave(ret) {
          if (logged >= 40) return;
          const path = this.path ?? "";
          if (path.toLowerCase().indexOf("localization") < 0 && !ret.isNull()) return;
          logged++;
          log(`LoadAssetFromPathAsync("${path}") -> ${ret.isNull() ? "NULL (not in the asset map)" : "ok"}`);
        }
      });
    }
  });
  section("bundle hash report", () => {
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const catalog = cls(img, "AssetCatalog");
    let reported = false;
    Interceptor.attach(catalog.method("SetCacheExpiration").virtualAddress, {
      onEnter() {
        if (reported) return;
        try {
          const target = `${persistentPath()}/tesl-bundle-hashes.txt`;
          const manifest = mgr.field("m_AssetBundleManifest").value;
          if (isNull(manifest)) {
            log("bundle hashes: the manifest is not loaded yet");
            return;
          }
          reported = true;
          const names = manifest.method("GetAllAssetBundles").invoke();
          const lines = [];
          for (let i = 0; i < names.length; i++) {
            const name = names.get(i)?.content ?? "";
            const hash = manifest.method("GetAssetBundleHash").invoke(Il2Cpp.string(name));
            const hex = String(hash?.method("ToString").invoke()?.content ?? "");
            lines.push(`${name} ${hex}`);
          }
          Il2Cpp.corlib.class("System.IO.File").method("WriteAllText").invoke(Il2Cpp.string(target), Il2Cpp.string(lines.join("\n")));
          log(`bundle hashes: wrote ${lines.length} entries to ${target}`);
        } catch (e) {
          log(`bundle hash report failed: ${e}`);
        }
      }
    });
  });
  log("setup finished");
});

✄
{
  "version": 3,
  "sources": ["node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/application.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/boxed.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/config.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/exception-listener.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/exports.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/filters.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/gc.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/android.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/console.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/decorate.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/getter.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/lazy.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/native-struct.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/object.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/offset-of.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/read-native-iterator.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/read-native-list.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/recycle.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/utils/unity-version.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/memory.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/module.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/nullable.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/perform.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/tracer.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/array.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/assembly.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/class.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/delegate.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/domain.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/field.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/gc-handle.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/image.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/memory-snapshot.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/method.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/object.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/parameter.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/pointer.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/reference.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/string.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/thread.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/type.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/structs/value-type.ts", "node_modules/.pnpm/frida-il2cpp-bridge@0.14.0/node_modules/frida-il2cpp-bridge/dist/index.ts", "hook.ts"],
  "mappings": ";;;;;;;AAAA,IAAUA;CAAV,SAAUA,SAAM;AAEC,EAAAA,QAAA,cAAc;;;;;;;;;;;;;;;IAevB,IAAI,WAAQ;AACR,aAAO,gBAAgB,wBAAwB;IACnD;;;;;;;;;;;;;;;IAgBA,IAAI,aAAU;AACV,aAAO,gBAAgB,gBAAgB,KAAK,gBAAgB,sBAAsB,KAAK,QAAQ,WAAW;IAC9G;;;;;;;;;;;;;;IAeA,IAAI,UAAO;AACP,aACI,gBAAgB,aAAa,KAC7BA,QAAO,OACF,kBAAiB,EACjB,OAAO,CAAC,UAAUC,aAAW;AAC1B,eAAO,CAAC,SAAS,QAAQ,EAAE,SAASA,SAAQ,IAAI,IAAI,SAAS,OAAO,YAAY,KAAKA,SAAQ,SAASA,SAAQ,IAAI,CAAC,IAAI;MAC3H,GAAG,IAAI,SAAS,KAAK,CAAC,EACrB,UAAS;IAEtB;;AAyBJ,SAAOD,SAAQ,gBAAgB,MAAK;AAChC,QAAI;AACA,YAAM,eAAeA,QAAO,QAAQ,gBAAgB,gBAAgB,kBAAkB;AAEtF,UAAI,gBAAgB,MAAM;AACtB,eAAO;MACX;IACJ,SAAS,GAAG;IACZ;AAEA,UAAM,gBAAgB,aAAS;AAC3B,aAAOA,QAAO,OAAO,kBAAiB,EACjC,OAAO,OAAK,EAAE,QAAQ,aAAa,EAAE,QAAQ,YAAY,EAAE,QAAQ,QAAQ,EAC3E,IAAI,QAAM,EAAE,MAAM,EAAE,SAAS,MAAM,EAAE,KAAI,EAAG;AAEjD,aAAOA,QAAO,OAAO,gBAAgB,KAAK;AAE1C,aAAO,QAAQ,gBAAgB,KAAK,EAAE,OAAO,OAAK,EAAE,QAAQ,UAAa,EAAE,KAAK,QAAQA,QAAO,OAAO,IAAI;IAC9G;AAEA,eAAW,SAAS,cAAa,GAAI;AACjC,UAAI;AACJ,UAAI;AACA,kBAAU,OAAO,SAAS,MAAM,MAAM,MAAM,MAAM,mBAAmB;MACzE,SAAS,GAAG;AACR;MACJ;AAEA,eAAS,EAAE,QAAO,KAAM,SAAS;AAC7B,eAAO,QAAQ,OAAM,KAAM,GAAG;AAC1B,oBAAU,QAAQ,IAAI,CAAC;QAC3B;AACA,cAAM,QAAQ,aAAa,KAAK,QAAQ,IAAI,CAAC,EAAE,YAAW,CAAE;AAE5D,YAAI,SAAS,QAAW;AACpB,iBAAO;QACX;MACJ;IACJ;AAEA,UAAM,kEAAkE;EAC5E,GAAG,IAAI;AAEP,WAAS,gBAAgB,QAAc;AACnC,UAAM,cAAcA,QAAO,QAAQ,oBAAoB,OAAO,gBAAgB,8BAA8B,MAAM,CAAC;AAEnH,YACK,YAAY,OAAM,IACbA,QAAO,OAAO,YAAY,wBAAwB,GAAG,OAAO,SAAS,yBAAyB,GAAG,UAAyB,MAAM,GAAG,OAAM,IACzI,IAAIA,QAAO,OAAO,IAAI,eAAe,aAAa,WAAW,CAAA,CAAE,EAAC,CAAE,IACrE,WAAU,GAAI,WAAW;EAEpC;AACJ,GA5IUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,WAAgB,MACZ,OACA,MAIW;AAEX,UAAM,UAAU;MACZ,MAAM;MACN,OAAO;MACP,OAAO;MACP,QAAQ;MACR,OAAO;MACP,QAAQ;MACR,OAAO;MACP,QAAQ;MACR,MAAM;MACN,QAAQ;MACR,SAAS;;AAGb,UAAM,YACF,OAAO,SAAS,YACV,mBACA,OAAO,SAAS,WAChB,QAAQ,QAAQ,OAAO,IACvB,iBAAiB,QACjB,iBACA,iBAAiB,SACjB,kBACA,iBAAiB,gBACjB,QAAQ,QAAQ,QAAQ,IACxB,MAAM,sDAAsD,OAAO,KAAK,GAAG;AAErF,UAAM,SAASA,QAAO,OAAO,MAAM,aAAa,MAAM,gCAAgC,IAAI,GAAG,CAAC,EAAE,MAAK;AACrG,KAAC,OAAO,SAAY,SAAS,KAAK,OAAO,SAAS,UAAU,KAAK,MAAM,4CAA4C,SAAS,GAAG,GAAG,QAAQ;AAE1I,WAAO;EACX;AAvCgB,EAAAA,QAAA,QAAK;AAwCzB,GA1CUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AASC,EAAAA,QAAA,UAIT;IACA,YAAY;IACZ,cAAc;IACd,SAAS;;AAEjB,GAlBUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAyBZ,WAAgB,yBAAyB,eAAkC,WAAS;AAChF,UAAM,gBAAgBA,QAAO,QAAQ,iBAAgB;AAErD,WAAO,YAAY,OAAOA,QAAO,OAAO,gBAAgB,aAAa,GAAG,SAAU,MAAI;AAClF,UAAI,gBAAgB,aAAa,CAACA,QAAO,QAAQ,iBAAgB,EAAG,OAAO,aAAa,GAAG;AACvF;MACJ;AAEA,aAAO,IAAIA,QAAO,OAAO,KAAK,CAAC,EAAE,YAAW,CAAE,CAAC;IACnD,CAAC;EACL;AAVgB,EAAAA,QAAA,2BAAwB;AAW5C,GApCUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AA4BC,EAAAA,QAAA,UAAU;IACnB,IAAI,QAAK;AACL,aAAO,EAAE,gBAAgB,WAAW,CAAC,QAAQ,CAAC;IAClD;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,uBAAuB,UAAU,CAAC,SAAS,CAAC;IACzD;IAEA,IAAI,WAAQ;AACR,aAAO,EAAE,oBAAoB,WAAW,CAAC,WAAW,QAAQ,CAAC;IACjE;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,WAAW,CAAC,SAAS,CAAC;IAChE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,QAAQ,CAAC,WAAW,SAAS,CAAC;IACpE;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,WAAW,CAAC,WAAW,WAAW,SAAS,CAAC;IACnF;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,iCAAiC,WAAW,CAAC,SAAS,CAAC;IACpE;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,0BAA0B,WAAW,CAAC,WAAW,QAAQ,CAAC;IACvE;IAEA,IAAI,2BAAwB;AACxB,aAAO,EAAE,mCAAmC,OAAO,CAAC,SAAS,CAAC;IAClE;IAEA,IAAI,uBAAoB;AACpB,aAAO,EAAE,iCAAiC,WAAW,CAAC,SAAS,CAAC;IACpE;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,8BAA8B,WAAW,CAAC,SAAS,CAAC;IACjE;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,mCAAmC,WAAW,CAAC,SAAS,CAAC;IACtE;IAEA,IAAI,uBAAoB;AACpB,aAAO,EAAE,kCAAkC,WAAW,CAAC,SAAS,CAAC;IACrE;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,oCAAoC,WAAW,CAAC,WAAW,SAAS,CAAC;IAClF;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,WAAW,CAAC,WAAW,SAAS,CAAC;IACzE;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,OAAO,CAAC,SAAS,CAAC;IACzD;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,WAAW,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,uBAAoB;AACpB,aAAO,EAAE,8BAA8B,SAAS,CAAC,SAAS,CAAC;IAC/D;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,+BAA+B,WAAW,CAAC,WAAW,SAAS,CAAC;IAC7E;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,qCAAqC,WAAW,CAAC,WAAW,WAAW,KAAK,CAAC;IAC1F;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,WAAW,CAAC,WAAW,SAAS,CAAC;IAC1E;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,WAAW,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,oBAAiB;AACjB,aAAO,EAAE,8BAA8B,WAAW,CAAC,SAAS,CAAC;IACjE;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,iCAAiC,WAAW,CAAC,WAAW,SAAS,CAAC;IAC/E;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,WAAW,CAAC,SAAS,CAAC;IAC9D;IAEA,IAAI,0BAAuB;AACvB,aAAO,EAAE,sCAAsC,WAAW,CAAC,SAAS,CAAC;IACzE;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,2BAA2B,SAAS,CAAC,WAAW,SAAS,CAAC;IACvE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,WAAW,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,+BAA+B,QAAQ,CAAC,SAAS,CAAC;IAC/D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,mCAAmC,QAAQ,CAAC,WAAW,SAAS,CAAC;IAC9E;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,wBAAwB,QAAQ,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,QAAQ,CAAC,SAAS,CAAC;IAC3D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,oBAAiB;AACjB,aAAO,EAAE,+BAA+B,QAAQ,CAAC,WAAW,WAAW,MAAM,CAAC;IAClF;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,4BAAyB;AACzB,aAAO,EAAE,+BAA+B,WAAW,CAAC,WAAW,SAAS,CAAC;IAC7E;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,WAAW,CAAA,CAAE;IAC/C;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,gCAAgC,WAAW,CAAC,WAAW,SAAS,CAAC;IAC9E;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,2BAA2B,WAAW,CAAC,SAAS,CAAC;IAC9D;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,OAAO,CAAC,SAAS,CAAC;IACzD;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,WAAW,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,SAAS,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,iCAAiC,QAAQ,CAAC,WAAW,SAAS,CAAC;IAC5E;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,WAAW,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,iCAAiC,QAAQ,CAAC,WAAW,SAAS,CAAC;IAC5E;IAEA,IAAI,OAAI;AACJ,aAAO,EAAE,eAAe,QAAQ,CAAC,SAAS,CAAC;IAC/C;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,QAAQ,CAAC,KAAK,CAAC;IACjD;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,8BAA8B,QAAQ,CAAA,CAAE;IACrD;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,QAAQ,CAAA,CAAE;IAC5C;IAEA,IAAI,WAAQ;AACR,aAAO,EAAE,oBAAoB,QAAQ,CAAA,CAAE;IAC3C;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,QAAQ,CAAC,WAAW,SAAS,CAAC;IACrE;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,2BAA2B,SAAS,CAAA,CAAE;IACnD;IAEA,IAAI,oBAAiB;AACjB,aAAO,EAAE,mCAAmC,SAAS,CAAA,CAAE;IAC3D;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,2BAA2B,SAAS,CAAA,CAAE;IACnD;IAEA,IAAI,oBAAiB;AACjB,aAAO,EAAE,8BAA8B,WAAW,CAAC,QAAQ,CAAC;IAChE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,wBAAwB,QAAQ,CAAC,QAAQ,CAAC;IACvD;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,uBAAuB,UAAU,CAAC,WAAW,MAAM,CAAC;IACjE;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,+BAA+B,UAAU,CAAC,WAAW,MAAM,CAAC;IACzE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,QAAQ,CAAA,CAAE;IAChD;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAA,CAAE;IACnD;IAEA,IAAI,oBAAiB;AACjB,aAAO,EAAE,mCAAmC,QAAQ,CAAC,OAAO,CAAC;IACjE;IAEA,IAAI,+BAA4B;AAC5B,aAAO,EAAE,0CAA0C,QAAQ,CAAA,CAAE;IACjE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,QAAQ,CAAA,CAAE;IAChD;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,wBAAwB,QAAQ,CAAA,CAAE;IAC/C;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,WAAW,CAAA,CAAE;IAC/C;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,WAAW,CAAC,SAAS,CAAC;IAChE;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,WAAW,CAAC,WAAW,MAAM,CAAC;IACrE;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,gCAAgC,UAAU,CAAC,SAAS,CAAC;IAClE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,yBAAyB,WAAW,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,aAAU;AACV,aAAO,EAAE,eAAe,QAAQ,CAAC,SAAS,CAAC;IAC/C;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,yCAAyC,WAAW,CAAC,WAAW,OAAO,WAAW,WAAW,SAAS,CAAC;IACpH;IAEA,IAAI,2BAAwB;AACxB,aAAO,EAAE,2CAA2C,WAAW,CAAC,WAAW,OAAO,WAAW,WAAW,WAAW,SAAS,CAAC;IACjI;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,yCAAyC,QAAQ,CAAC,SAAS,CAAC;IACzE;IAEA,IAAI,iCAA8B;AAC9B,aAAO,EAAE,kDAAkD,QAAQ,CAAC,SAAS,CAAC;IAClF;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,kCAAkC,QAAQ,CAAC,SAAS,CAAC;IAClE;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,qCAAqC,QAAQ,CAAC,SAAS,CAAC;IACrE;IAEA,IAAI,wBAAqB;AACrB,aAAO,EAAE,kCAAkC,WAAW,CAAA,CAAE;IAC5D;IAEA,IAAI,qBAAkB;AAClB,aAAO,EAAE,wCAAwC,QAAQ,CAAC,SAAS,CAAC;IACxE;IAEA,IAAI,2BAAwB;AACxB,aAAO,EAAE,sCAAsC,WAAW,CAAC,WAAW,SAAS,CAAC;IACpF;IAEA,IAAI,2BAAwB;AACxB,aAAO,EAAE,sCAAsC,WAAW,CAAC,WAAW,SAAS,CAAC;IACpF;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,WAAW,CAAC,SAAS,CAAC;IAC9D;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,UAAU,CAAC,WAAW,SAAS,CAAC;IACxE;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,WAAW,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,WAAW,CAAC,WAAW,SAAS,CAAC;IAC1E;IAEA,IAAI,0BAAuB;AACvB,aAAO,EAAE,iCAAiC,SAAS,CAAC,SAAS,CAAC;IAClE;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,gCAAgC,WAAW,CAAC,WAAW,QAAQ,CAAC;IAC7E;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,gCAAgC,WAAW,CAAC,WAAW,SAAS,CAAC;IAC9E;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,2BAA2B,WAAW,CAAC,WAAW,QAAQ,CAAC;IACxE;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,iCAAiC,WAAW,CAAC,SAAS,CAAC;IACpE;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,6BAA6B,QAAQ,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,wBAAwB,QAAQ,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,uBAAuB,QAAQ,CAAC,SAAS,CAAC;IACvD;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,wBAAwB,QAAQ,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,4BAA4B,QAAQ,CAAC,WAAW,QAAQ,CAAC;IACtE;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,QAAQ,CAAC,WAAW,QAAQ,CAAC;IACrE;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,uBAAuB,QAAQ,CAAC,SAAS,CAAC;IACvD;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,2BAA2B,WAAW,CAAC,SAAS,CAAC;IAC9D;IAEA,IAAI,yBAAsB;AACtB,aAAO,EAAE,oCAAoC,WAAW,CAAC,WAAW,SAAS,CAAC;IAClF;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,wCAAwC,QAAQ,CAAC,WAAW,SAAS,CAAC;IACnF;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,WAAW,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,UAAU,CAAC,SAAS,CAAC;IAC5D;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,uBAAuB,WAAW,CAAC,SAAS,CAAC;IAC1D;IAEA,IAAI,sBAAmB;AACnB,aAAO,EAAE,wBAAwB,WAAW,CAAC,SAAS,CAAC;IAC3D;IAEA,IAAI,iBAAc;AACd,aAAO,EAAE,uBAAuB,WAAW,CAAC,SAAS,CAAC;IAC1D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,wBAAwB,SAAS,CAAC,SAAS,CAAC;IACzD;IAEA,IAAI,YAAS;AACT,aAAO,EAAE,qBAAqB,WAAW,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,oBAAoB,WAAW,CAAC,WAAW,SAAS,CAAC;IAClE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,wBAAwB,WAAW,CAAC,SAAS,CAAC;IAC3D;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,wBAAwB,QAAQ,CAAC,SAAS,CAAC;IACxD;IAEA,IAAI,2BAAwB;AACxB,aAAO,EAAE,0CAA0C,WAAW,CAAC,SAAS,CAAC;IAC7E;IAEA,IAAI,mBAAgB;AAChB,aAAO,EAAE,yBAAyB,WAAW,CAAA,CAAE;IACnD;IAEA,IAAI,aAAU;AACV,aAAO,EAAE,uBAAuB,QAAQ,CAAC,SAAS,CAAC;IACvD;IAEA,IAAI,aAAU;AACV,aAAO,EAAE,sBAAsB,QAAQ,CAAC,WAAW,SAAS,CAAC;IACjE;IAEA,IAAI,eAAY;AACZ,aAAO,EAAE,0BAA0B,WAAW,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,cAAW;AACX,aAAO,EAAE,wBAAwB,WAAW,CAAC,SAAS,CAAC;IAC3D;IAEA,IAAI,gBAAa;AACb,aAAO,EAAE,0BAA0B,WAAW,CAAC,SAAS,CAAC;IAC7D;IAEA,IAAI,kBAAe;AACf,aAAO,EAAE,wBAAwB,OAAO,CAAC,SAAS,CAAC;IACvD;;AAGJ,WAASA,QAAA,SAAS,IAAI;AAItB,SAAOA,SAAQ,yBAAyB,MAAM,IAAI,QAAO,6qEAAA,GAA8C,IAAI;AAE3G,WAAS,EAAmF,YAAgC,SAAY,UAAW;AAC/I,UAAM,SACFA,QAAO,QAAQ,UAAU,UAAU,IAAG,KAAMA,QAAO,OAAO,iBAAiB,UAAU,KAAKA,QAAA,sBAAsB,UAAU;AAE9H,UAAM,SAAS,IAAI,eAAe,UAAU,MAAM,SAAS,QAAQ;AAEnE,WAAO,OAAO,OAAM,IACd,IAAI,MAAM,QAAQ;MACd,IAAI,OAAsB,MAAyB;AAC/C,cAAM,WAAW,MAAM,IAAI;AAC3B,eAAO,OAAO,aAAa,aAAa,SAAS,KAAK,KAAK,IAAI;MACnE;MACA,QAAK;AACD,YAAI,UAAU,MAAM;AAChB,gBAAM,2BAA2B,UAAU,EAAE;QACjD,WAAW,OAAO,OAAM,GAAI;AACxB,gBAAM,UAAU,UAAU,oFAAoF;QAClH;MACJ;KACH,IACD;EACV;AAGJ,GA5iBUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAiBZ,WAAgB,GAAyD,OAAmB;AACxF,WAAO,CAAC,YAAuB;AAC3B,UAAI,mBAAmBA,QAAO,OAAO;AACjC,eAAO,MAAM,iBAAiB,OAAO;MACzC,OAAO;AACH,eAAO,MAAM,iBAAiB,QAAQ,KAAK;MAC/C;IACJ;EACJ;AARgB,EAAAA,QAAA,KAAE;AA0BlB,WAAgB,UAAgE,OAAmB;AAC/F,WAAO,CAAC,YAAuB;AAC3B,UAAI,mBAAmBA,QAAO,OAAO;AACjC,eAAO,QAAQ,OAAO,KAAK;MAC/B,OAAO;AACH,eAAO,QAAQ,MAAM,OAAO,KAAK;MACrC;IACJ;EACJ;AARgB,EAAAA,QAAA,YAAS;AAS7B,GApDUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAIC,EAAAA,QAAA,KAAK;;;;IAId,IAAI,eAAY;AACZ,YAAM,SAAwB,CAAA;AAE9B,MAAAA,QAAO,QAAQ,cACX,IAAI,eACA,CAAC,MAAqB,MAAoB;AAStC,eAAO,KAAK;UACR,MAAM,KAAK,YAAW;UACtB,MAAM,KAAK,IAAI,QAAQ,WAAW,EAAE,QAAO;SAC9C;MACL,GACA,QACA,CAAC,WAAW,SAAS,CAAC,GAE1B,IAAI;AAGR,aAAO;IACX;;;;IAKA,IAAI,WAAQ;AACR,aAAOA,QAAO,QAAQ,cAAa;IACvC;;;;IAKA,IAAI,YAAS;AACT,aAAO,CAACA,QAAO,QAAQ,aAAY;IACvC;;;;;IAMA,IAAI,gBAAa;AACb,aAAO,CAAC,CAACA,QAAO,QAAQ,gBAAe;IAC3C;;;;;IAMA,IAAI,eAAY;AACZ,aAAOA,QAAO,QAAQ,kBAAiB;IAC3C;;;;IAKA,IAAI,eAAY;AACZ,aAAOA,QAAO,QAAQ,cAAa;IACvC;;;;IAKA,IAAI,UAAU,OAAc;AACxB,cAAQA,QAAO,QAAQ,SAAQ,IAAKA,QAAO,QAAQ,UAAS;IAChE;;;;;IAMA,IAAI,aAAa,aAA2B;AACxC,MAAAA,QAAO,QAAQ,kBAAkB,WAAW;IAChD;;;;;IAMA,OAAO,OAAmB;AACtB,YAAM,UAA2B,CAAA;AAEjC,YAAM,WAAW,CAAC,SAAwB,SAAgB;AACtD,iBAAS,IAAI,GAAG,IAAI,MAAM,KAAK;AAC3B,kBAAQ,KAAK,IAAIA,QAAO,OAAO,QAAQ,IAAI,IAAI,QAAQ,WAAW,EAAE,YAAW,CAAE,CAAC;QACtF;MACJ;AAEA,YAAM,iBAAiB,IAAI,eAAe,UAAU,QAAQ,CAAC,WAAW,OAAO,SAAS,CAAC;AAEzF,UAAI,CAACA,QAAO,QAAQ,yBAAyB,OAAM,GAAI;AACnD,cAAM,UAAU,IAAI,eAAe,MAAK;QAAE,GAAG,QAAQ,CAAA,CAAE;AACvD,cAAM,QAAQA,QAAO,QAAQ,yBAAyB,OAAO,GAAG,gBAAgB,MAAM,SAAS,OAAO;AAEtG,QAAAA,QAAO,QAAQ,+BAA+B,KAAK;AACnD,QAAAA,QAAO,QAAQ,uBAAuB,KAAK;MAC/C,OAAO;AACH,cAAM,UAAU,CAAC,QAAuB,SAAgB;AACpD,cAAI,CAAC,OAAO,OAAM,KAAM,KAAK,QAAQ,CAAC,KAAK,GAAG;AAC1C,YAAAA,QAAO,KAAK,MAAM;AAClB,mBAAO;UACX,OAAO;AACH,mBAAOA,QAAO,MAAM,IAAI;UAC5B;QACJ;AAEA,cAAM,kBAAkB,IAAI,eAAe,SAAS,WAAW,CAAC,WAAW,UAAU,SAAS,CAAC;AAE/F,aAAK,UAAS;AAEd,cAAM,QAAQA,QAAO,QAAQ,uBAAuB,OAAO,GAAG,gBAAgB,MAAM,eAAe;AACnG,QAAAA,QAAO,QAAQ,+BAA+B,KAAK;AACnD,QAAAA,QAAO,QAAQ,iBAAiB,KAAK;AAErC,aAAK,WAAU;AAEf,QAAAA,QAAO,QAAQ,mBAAmB,KAAK;MAC3C;AAEA,aAAO;IACX;;;;IAKA,QAAQ,YAAqB;AACzB,MAAAA,QAAO,QAAQ,UAAU,aAAa,IAAI,IAAI,aAAa,IAAI,IAAI,UAAU;IACjF;;;;IAKA,iBAAc;AACV,MAAAA,QAAO,QAAQ,iBAAgB;IACnC;;;;IAKA,aAAU;AACN,aAAOA,QAAO,QAAQ,aAAY;IACtC;;;;IAKA,6BAA0B;AACtB,aAAOA,QAAO,QAAQ,6BAA4B;IACtD;;;;;IAMA,YAAS;AACL,aAAOA,QAAO,QAAQ,YAAW;IACrC;;AAER,GA3KUA,YAAAA,UAAM,CAAA,EAAA;ACChB,IAAU;CAAV,SAAUE,UAAO;AAGb,SAAOA,UAAS,YAAY,MAAK;AAC7B,UAAM,QAAQ,YAAY,sBAAsB;AAChD,WAAO,QAAQ,SAAS,KAAK,IAAI;EACrC,GAAG,IAAI;AAEP,WAAS,YAAY,MAAY;AAC7B,UAAM,SAAS,QAAQ,iBAAiB,SAAS,GAAG,iBAAiB,uBAAuB;AAE5F,QAAI,QAAQ;AACR,YAAM,wBAAwB,IAAI,eAAe,QAAQ,QAAQ,CAAC,WAAW,SAAS,CAAC;AAEvF,YAAM,QAAQ,OAAO,MAAM,EAAE,EAAE,aAAa,IAAI;AAChD,4BAAsB,OAAO,gBAAgB,IAAI,GAAG,KAAK;AAEzD,aAAO,MAAM,YAAW,KAAM;IAClC;EACJ;AACJ,GApBU,YAAA,UAAO,CAAA,EAAA;ACAjB,SAAS,MAAM,SAAY;AACvB,QAAM,QAAQ,IAAI,MAAM,OAAO;AAE/B,QAAM,OAAO;AACb,QAAM,QAAQ,MAAM,OAEd,QAAQ,mBAAmB,kCAAkC,GAG7D,QAAQ,+BAA+B,gBAAgB,GAEvD,OAAO,SAAS;AAEtB,QAAM;AACV;AAGA,SAAS,KAAK,SAAY;AACrB,aAAmB,QAAQ,IAAI,+BAA+B,OAAO,EAAE;AAC5E;AAQA,SAAS,OAAO,SAAY;AACvB,aAAmB,QAAQ,IAAI,+BAA+B,OAAO,EAAE;AAC5E;AC7BA,SAAS,SACL,QACA,WACA,cAAc,OAAO,0BAA0B,MAAa,GAAC;AAE7D,aAAW,OAAO,aAAa;AAC3B,gBAAY,GAAG,IAAI,UAAU,QAAQ,KAAK,YAAY,GAAG,CAAC;EAC9D;AAEA,SAAO,iBAAiB,QAAQ,WAAW;AAE3C,SAAO;AACX;ACZA,SAAS,OACL,QACA,KACA,KACA,WAAqF;AAErF,aAAW,OAAO,eAAe,QAAQ,KAAK,YAAY,QAAQ,KAAK,EAAE,KAAK,cAAc,KAAI,CAAE,KAAK,EAAE,KAAK,cAAc,KAAI,CAAE;AACtI;ACPA,SAAS,KAAK,GAAQ,aAA0B,YAA8B;AAC1E,QAAMC,UAAS,WAAW;AAE1B,MAAI,CAACA,SAAQ;AACT,UAAM,IAAI,MAAM,+CAA+C;EACnE;AAEA,aAAW,MAAM,WAAA;AACb,UAAM,QAAQA,QAAO,KAAK,IAAI;AAC9B,WAAO,eAAe,MAAM,aAAa;MACrC;MACA,cAAc,WAAW;MACzB,YAAY,WAAW;MACvB,UAAU;KACb;AACD,WAAO;EACX;AACA,SAAO;AACX;AClBA,IAAM,eAAN,MAAkB;EACL;EAET,YAAY,iBAAmC;AAC3C,QAAI,2BAA2B,eAAe;AAC1C,WAAK,SAAS;IAClB,OAAO;AACH,WAAK,SAAS,gBAAgB;IAClC;EACJ;EAEA,OAAO,OAAmB;AACtB,WAAO,KAAK,OAAO,OAAO,MAAM,MAAM;EAC1C;EAEA,SAAM;AACF,WAAO,KAAK,OAAO,OAAM;EAC7B;EAEA,aAAU;AACN,WAAO,KAAK,OAAM,IAAK,OAAO;EAClC;;ACrBJ,SAAS,kBAA8C,KAAM;AACzD,SAAO,OAAO,KAAK,GAAG,EAAE,OAAO,CAACC,MAAK,SAAWA,KAAIA,KAAI,GAAG,CAAC,IAAY,KAAMA,OAAM,GAAG;AAC3F;ACEA,cAAc,UAAU,WAAW,SAAU,WAAW,OAAK;AACzD,YAAU;AAEV,WAAS,IAAI,GAAG,QAAQ,IAAI,IAAI,QAAQ,IAAI,CAAC,OAAO,KAAK;AACrD,QAAI,UAAU,QAAQ,IAAI,KAAK,IAAI,CAAC,IAAI,KAAK,IAAI,CAAC,CAAC,GAAG;AAClD,aAAO;IACX;EACJ;AAEA,SAAO;AACX;ACdA,SAAS,mBAAmB,OAAwD;AAChF,QAAM,QAAQ,CAAA;AACd,QAAM,WAAW,OAAO,MAAM,QAAQ,WAAW;AAEjD,MAAI,SAAS,MAAM,QAAQ;AAE3B,SAAO,CAAC,OAAO,OAAM,GAAI;AACrB,UAAM,KAAK,MAAM;AACjB,aAAS,MAAM,QAAQ;EAC3B;AAEA,SAAO;AACX;ACZA,SAAS,eAAe,OAAsD;AAC1E,QAAM,gBAAgB,OAAO,MAAM,QAAQ,WAAW;AACtD,QAAM,eAAe,MAAM,aAAa;AAExC,MAAI,aAAa,OAAM,GAAI;AACvB,WAAO,CAAA;EACX;AAEA,QAAM,QAAQ,IAAI,MAAM,cAAc,QAAO,CAAE;AAE/C,WAAS,IAAI,GAAG,IAAI,MAAM,QAAQ,KAAK;AACnC,UAAM,CAAC,IAAI,aAAa,IAAI,IAAI,QAAQ,WAAW,EAAE,YAAW;EACpE;AAEA,SAAO;AACX;ACfA,SAAS,QAA6E,OAAQ;AAC1F,SAAO,IAAI,MAAM,OAAO;IACpB,OAAO,oBAAI,IAAG;IACd,UAAU,QAAW,UAAyB;AAC1C,YAAM,SAAS,SAAS,CAAC,EAAE,SAAQ;AAEnC,UAAI,CAAC,KAAK,MAAM,IAAI,MAAM,GAAG;AACzB,aAAK,MAAM,IAAI,QAAQ,IAAI,OAAO,SAAS,CAAC,CAAC,CAAC;MAClD;AACA,aAAO,KAAK,MAAM,IAAI,MAAM;IAChC;GAC4C;AACpD;ACZA,IAAU;CAAV,SAAUC,eAAY;AAClB,QAAM,UAAU;AAEhB,WAAgB,KAAK,QAAqB;AACtC,WAAO,QAAQ,MAAM,OAAO,IAAI,CAAC;EACrC;AAFgB,EAAAA,cAAA,OAAI;AAIpB,WAAgB,IAAI,GAAW,GAAS;AACpC,WAAO,QAAQ,GAAG,CAAC,KAAK;EAC5B;AAFgB,EAAAA,cAAA,MAAG;AAInB,WAAgB,GAAG,GAAW,GAAS;AACnC,WAAO,QAAQ,GAAG,CAAC,IAAI;EAC3B;AAFgB,EAAAA,cAAA,KAAE;AAIlB,WAAS,QAAQ,GAAW,GAAS;AACjC,UAAM,WAAW,EAAE,MAAM,OAAO;AAChC,UAAM,WAAW,EAAE,MAAM,OAAO;AAEhC,aAAS,IAAI,GAAG,KAAK,GAAG,KAAK;AACzB,YAAMC,KAAI,OAAO,WAAW,CAAC,KAAK,EAAE;AACpC,YAAMC,KAAI,OAAO,WAAW,CAAC,KAAK,EAAE;AAEpC,UAAID,KAAIC;AAAG,eAAO;eACTD,KAAIC;AAAG,eAAO;IAC3B;AAEA,WAAO;EACX;AACJ,GA7BU,iBAAA,eAAY,CAAA,EAAA;ACDtB,IAAUC;CAAV,SAAUA,SAAM;AAKZ,WAAgB,MAAM,OAAwB,QAAQ,aAAW;AAC7D,WAAOA,QAAO,QAAQ,MAAM,IAAI;EACpC;AAFgB,EAAAA,QAAA,QAAK;AAgBrB,WAAgB,KAAK,SAA2B;AAC5C,WAAOA,QAAO,QAAQ,KAAK,OAAO;EACtC;AAFgB,EAAAA,QAAA,OAAI;AAKpB,WAAgB,KAAK,SAAwB,MAAiB;AAC1D,YAAQ,KAAK,WAAW;MACpB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,CAAC,CAAC,QAAQ,OAAM;MAC3B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,OAAM;MACzB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,OAAM;MACzB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAO;MAC1B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,UAAS;MAC5B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,WAAU;MAC7B,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,YAAW;MAC9B,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,IAAIA,QAAO,QAAQ,QAAQ,YAAW,GAAI,KAAK,MAAM,QAAS;MACzE,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,IAAIA,QAAO,UAAU,SAAS,IAAI;MAC7C,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,IAAIA,QAAO,OAAO,QAAQ,YAAW,CAAE;MAClD,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,KAAK,MAAM,cAAc,IAAIA,QAAO,UAAU,SAAS,IAAI,IAAI,IAAIA,QAAO,OAAO,QAAQ,YAAW,CAAE;MACjH,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,IAAIA,QAAO,OAAO,QAAQ,YAAW,CAAE;MAClD,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,IAAIA,QAAO,MAAM,QAAQ,YAAW,CAAE;IACrD;AAEA,UAAM,gCAAgC,OAAO,uCAAuC,KAAK,IAAI,KAAK,KAAK,SAAS,yBAAyB;EAC7I;AA9CgB,EAAAA,QAAA,OAAI;AAiDpB,WAAgB,MAAM,SAAwB,OAAY,MAAiB;AACvE,YAAQ,KAAK,WAAW;MACpB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAQ,CAAC,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAQ,KAAK;MAChC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,QAAQ,KAAK;MAChC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,SAAS,KAAK;MACjC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,WAAW,KAAK;MACnC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,YAAY,KAAK;MACpC,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,QAAQ,aAAa,KAAK;MACrC,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,OAAO,KAAK,SAAS,OAAO,KAAK,MAAM,aAAa,GAAG;MAClE,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;MACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,eAAO,iBAAiBA,QAAO,aAAa,OAAO,KAAK,SAAS,OAAO,KAAK,MAAM,aAAa,GAAG,WAAW,QAAQ,aAAa,KAAK;IAChJ;AAEA,UAAM,wBAAwB,KAAK,OAAO,OAAO,uCAAuC,KAAK,IAAI,KAAK,KAAK,SAAS,yBAAyB;EACjJ;AA1CgB,EAAAA,QAAA,QAAK;AAmDrB,WAAgB,eACZ,OACA,MAAiB;AAEjB,QAAI,WAAW,MAAM,QAAQ,KAAK,GAAG;AACjC,YAAM,SAAS,OAAO,MAAM,KAAK,MAAM,aAAa;AACpD,YAAM,SAAS,KAAK,MAAM,OAAO,OAAO,OAAK,CAAC,EAAE,QAAQ;AAExD,eAAS,IAAI,GAAG,IAAI,OAAO,QAAQ,KAAK;AACpC,cAAM,iBAAiB,eAAe,MAAM,CAAC,GAAG,OAAO,CAAC,EAAE,IAAI;AAC9D,cAAM,OAAO,IAAI,OAAO,CAAC,EAAE,MAAM,EAAE,IAAIA,QAAO,OAAO,UAAU,GAAG,gBAAgB,OAAO,CAAC,EAAE,IAAI;MACpG;AAEA,aAAO,IAAIA,QAAO,UAAU,QAAQ,IAAI;IAC5C,WAAW,iBAAiB,eAAe;AACvC,UAAI,KAAK,eAAe;AACpB,eAAO,IAAIA,QAAO,UAAU,OAAO,IAAI;MAC3C;AAEA,cAAQ,KAAK,WAAW;QACpB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,IAAIA,QAAO,QAAQ,OAAO,KAAK,MAAM,QAAS;QACzD,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,IAAIA,QAAO,OAAO,KAAK;QAClC,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,IAAIA,QAAO,OAAO,KAAK;QAClC,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,IAAIA,QAAO,MAAM,KAAK;QACjC;AACI,iBAAO;MACf;IACJ,WAAW,KAAK,aAAaA,QAAO,KAAK,KAAK,SAAS;AACnD,aAAO,CAAC,CAAE;IACd,WAAW,KAAK,aAAaA,QAAO,KAAK,KAAK,cAAc,KAAK,MAAM,QAAQ;AAC3E,aAAO,eAAe,CAAC,KAAK,GAAG,IAAI;IACvC,OAAO;AACH,aAAO;IACX;EACJ;AAzCgB,EAAAA,QAAA,iBAAc;AAkD9B,WAAgB,aAAa,OAAuD;AAChF,QAAI,OAAO,SAAS,WAAW;AAC3B,aAAO,CAAC;IACZ,WAAW,iBAAiBA,QAAO,WAAW;AAC1C,UAAI,MAAM,KAAK,MAAM,QAAQ;AACzB,eAAO,MAAM,MAA+B,SAAS,EAAE;MAC3D,OAAO;AACH,cAAM,IAAI,MAAM,KAAK,MAAM,OAAO,OAAO,CAAAC,OAAK,CAACA,GAAE,QAAQ,EAAE,IAAI,CAAAA,OAAK,aAAaA,GAAE,KAAK,KAAK,EAAE,KAAK,CAAC;AACrG,eAAO,EAAE,UAAU,IAAI,CAAC,CAAC,IAAI;MACjC;IACJ,OAAO;AACH,aAAO;IACX;EACJ;AAbgB,EAAAD,QAAA,eAAY;AAchC,GA9LUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AA0BZ,SAAOA,SAAQ,UAAU,MAAK;AAC1B,WAAO,UAAS,KAAM,MAAM,8BAA8B;EAC9D,CAAC;AAMM,iBAAe,WAAW,WAAW,OAAK;AAC7C,UAAM,SACF,UAAS,KACR,MAAM,IAAI,QAAgB,aAAU;AACjC,YAAM,CAAC,YAAY,kBAAkB,IAAI,uBAAsB;AAE/D,YAAM,UAAU,WAAW,MAAK;AAC5B,aAAK,oCAAoC,UAAU,gDAAgD;MACvG,GAAG,GAAK;AAER,YAAM,iBAAiB,QAAQ,qBAAqB;QAChD,QAAQE,SAAc;AAClB,cAAIA,QAAO,QAAQ,cAAe,sBAAsBA,QAAO,QAAQ,oBAAqB;AACxF,yBAAa,OAAO;AACpB,yBAAa,MAAK;AACd,sBAAQA,OAAM;AACd,6BAAe,OAAM;YACzB,CAAC;UACL;QACJ;OACH;IACL,CAAC;AAEL,YAAQ,eAAeF,SAAQ,UAAU,EAAE,OAAO,OAAM,CAAE;AAM1D,QAAIA,QAAO,QAAQ,UAAS,EAAG,OAAM,GAAI;AACrC,aAAO,MAAM,IAAI,QAAiB,aAAU;AACxC,cAAM,UAAU,WAAW,MAAK;AAC5B,cAAI,CAACA,QAAO,QAAQ,UAAS,EAAG,OAAM,GAAI;AACtC,iBAAK,yHAAyH;AAC9H,wBAAY,OAAM;AAClB,oBAAQ,KAAK;UACjB;QACJ,GAAG,GAAI;AAEP,cAAM,cAAc,YAAY,OAAOA,QAAO,QAAQ,YAAY;UAC9D,UAAO;AACH,yBAAa,OAAO;UACxB;UACA,UAAO;AACH,wBAAY,OAAM;AAClB,uBAAW,QAAQ,IAAI,IAAI,aAAa,MAAM,QAAQ,KAAK,CAAC;UAChE;SACH;MACL,CAAC;IACL;AAEA,WAAO;EACX;AApDsB,EAAAA,QAAA,aAAU;AAsDhC,WAAS,YAAS;AACd,UAAM,CAAC,YAAY,QAAQ,IAAI,uBAAsB;AACrD,WACI,QAAQ,iBAAiB,UAAU,KACnC,QAAQ,iBAAiB,YAAY,UAAU,MAC9C,QAAQ,YAAY,WAAW,QAAQ,oBAAoB,YAAY,SAAS,aAAa,EAAE,OAAO,IAAI,WAC3G;EAER;AAEA,WAAS,yBAAsB;AAC3B,QAAIA,QAAO,QAAQ,YAAY;AAC3B,aAAO,CAACA,QAAO,QAAQ,UAAU;IACrC;AAEA,YAAQ,QAAQ,UAAU;MACtB,KAAK;AACD,eAAO,CAAC,QAAQ,WAAW,iBAAiB,iBAAiB;MACjE,KAAK;AACD,eAAO,CAAC,kBAAkB;MAC9B,KAAK;AACD,eAAO,CAAC,kBAAkB,oBAAoB;IACtD;AAEA,UAAM,GAAG,QAAQ,QAAQ,uBAAuB;EACpD;AACJ,GAlHUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAiCZ,WAAgB,SAAS,aAA0F,OAAoB;AACnI,UAAM,cACF,OAAO,eAAe,YAChBA,QAAO,OAAO,MAAM,gBAAgB,IACpC,OAAO,eAAe,WACnB,SAASA,QAAO,OAAO,MAAM,cAAc,IAC5C,uBAAuB,QACrBA,QAAO,OAAO,MAAM,cAAc,IAClC,uBAAuB,SACrBA,QAAO,OAAO,MAAM,eAAe,IACnC,uBAAuB,gBACpB,SAASA,QAAO,OAAO,MAAM,eAAe,IAC7C,uBAAuBA,QAAO,YAC5B,YAAY,KAAK,QAChB,SAAS,MAAM,qEAAqE,WAAW,GAAG;AAEvH,QAAI,YAAY,eAAe,OAAO;AAClC,YAAM,8DAA8D,YAAY,KAAK,IAAI,GAAG;IAChG;AAEA,UAAM,gBAAgBA,QAAO,OAAO,MAAM,mBAAmB,EAAE,QAAQ,WAAW;AAClF,UAAM,SAAS,IAAIA,QAAO,UAAU,OAAO,MAAM,cAAc,aAAa,GAAG,cAAc,IAAI;AAEjG,KAAC,OAAO,SAAkB,UAAU,KAAK,OAAO,MAAe,WAAW,GAAG,QAAQ,eAAe;AACpG,QAAI,eAAe,MAAM;AACrB,aAAO,MAAM,OAAO,EAAE,QAAQ;IAClC;AAEA,WAAO;EACX;AA7BgB,EAAAA,QAAA,WAAQ;AA8B5B,GA/DUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEL,iBAAe,QAAW,OAA6B,OAA0C,QAAM;AAC1G,QAAI,iBAAuC;AAC3C,QAAI;AACA,YAAM,iBAAiB,MAAMA,QAAA,WAAW,QAAQ,MAAM;AAEtD,UAAI,QAAQ,UAAU,CAAC,gBAAgB;AACnC,eAAO,QAAQ,MAAMA,QAAO,WAAW,SAAS,KAAK,GAAG,MAAM;MAClE;AAEA,UAAIA,QAAO,iBAAiB,MAAM;AAC9B,yBAAiBA,QAAO,OAAO,OAAM;MACzC;AAEA,UAAI,QAAQ,UAAU,kBAAkB,MAAM;AAC1C,eAAO,SAAS,YAAY,MAAM,gBAAgB,OAAM,CAAE;MAC9D;AAEA,YAAM,SAAS,MAAK;AAEpB,aAAO,kBAAkB,UAAU,MAAM,SAAS;IACtD,SAAS,OAAY;AACjB,aAAO,SAAS,OAAI;AAAG,cAAM;MAAG,GAAG,KAAK;AACxC,aAAO,QAAQ,OAAU,KAAK;IAClC;AACI,UAAI,QAAQ,UAAU,kBAAkB,MAAM;AAC1C,uBAAe,OAAM;MACzB;IACJ;EACJ;AA5BsB,EAAAA,QAAA,UAAO;AA6BjC,GA/BUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,OAAM;;IAEf,SAA8B;MAC1B,OAAO;MACP,QAAQ,CAAA;MACR,SAAS,oBAAI,IAAG;MAChB,OAAO,MAAK;AACR,YAAI,KAAK,OAAO,SAAS,GAAG;AACxB,gBAAM,UAAU;EAAK,KAAK,OAAO,OAAO,KAAK,IAAI,CAAC;;AAElD,cAAI,KAAK,UAAU;AACf,mBAAO,OAAO;UAClB,OAAO;AACH,kBAAM,OAAO,SAAS,QAAQ,OAAO,OAAO;AAC5C,gBAAI,CAAC,KAAK,OAAO,QAAQ,IAAI,IAAI,GAAG;AAChC,mBAAK,OAAO,QAAQ,IAAI,IAAI;AAC5B,qBAAO,OAAO;YAClB;UACJ;AAEA,eAAK,OAAO,OAAO,SAAS;QAChC;MACJ;;;IAIJ,YAAoBA,QAAO,WAAW;;IAGtC,WAAoB;;IAGpB;;IAGA,WAA4B,CAAA;;IAG5B;;IAGA;;IAGA;;IAGA;;IAGA;;IAGA;;IAGA;;IAGA;IAEA,YAAY,SAA4B;AACpC,WAAK,WAAW;IACpB;;IAGA,OAAO,QAAqB;AACxB,WAAK,YAAY,OAAO;AACxB,aAAO;IACX;;IAGA,QAAQ,OAAc;AAClB,WAAK,WAAW;AAChB,aAAO;IACX;;IAGA,SAAM;AACF,WAAK,UAAUA,QAAO;AACtB,aAAO;IACX;;IAGA,cAAc,YAA6B;AACvC,WAAK,cAAc;AACnB,aAAO;IACX;;IAGA,WAAW,SAAuB;AAC9B,WAAK,WAAW;AAChB,aAAO;IACX;;IAGA,WAAW,SAAwB;AAC/B,WAAK,WAAW;AAChB,aAAO;IACX;;IAGA,iBAAiB,QAA8C;AAC3D,WAAK,kBAAkB;AACvB,aAAO;IACX;;IAGA,cAAc,QAAwC;AAClD,WAAK,eAAe;AACpB,aAAO;IACX;;IAGA,cAAc,QAA0C;AACpD,WAAK,gBAAgB;AACrB,aAAO;IACX;;IAGA,iBAAiB,QAAgD;AAC7D,WAAK,mBAAmB;AACxB,aAAO;IACX;;IAGA,MAAG;AACC,YAAM,eAAe,CAAC,WAA+B;AACjD,YAAI,KAAK,oBAAoB,QAAW;AACpC,eAAK,SAAS,KAAK,MAAM;AACzB;QACJ;AAEA,mBAAW,aAAa,OAAO,YAAY;AACvC,cAAI,KAAK,iBAAiB,SAAS,GAAG;AAClC,iBAAK,SAAS,KAAK,MAAM;AACzB;UACJ;QACJ;MACJ;AAEA,YAAM,gBAAgB,CAAC,WAAyC;AAC5D,mBAAW,UAAU,QAAQ;AACzB,uBAAa,MAAM;QACvB;MACJ;AAEA,YAAM,cAAc,CAAC,UAA6B;AAC9C,YAAI,KAAK,iBAAiB,QAAW;AACjC,wBAAc,MAAM,OAAO;AAC3B;QACJ;AAEA,mBAAW,UAAU,MAAM,SAAS;AAChC,cAAI,KAAK,cAAc,MAAM,GAAG;AAC5B,yBAAa,MAAM;UACvB;QACJ;MACJ;AAEA,YAAM,gBAAgB,CAAC,WAAwC;AAC3D,mBAAW,SAAS,QAAQ;AACxB,sBAAY,KAAK;QACrB;MACJ;AAEA,YAAM,iBAAiB,CAAC,aAAmC;AACvD,YAAI,KAAK,gBAAgB,QAAW;AAChC,wBAAc,SAAS,MAAM,OAAO;AACpC;QACJ;AAEA,mBAAW,SAAS,SAAS,MAAM,SAAS;AACxC,cAAI,KAAK,aAAa,KAAK,GAAG;AAC1B,wBAAY,KAAK;UACrB;QACJ;MACJ;AAEA,YAAM,mBAAmB,CAAC,eAA+C;AACrE,mBAAW,YAAY,YAAY;AAC/B,yBAAe,QAAQ;QAC3B;MACJ;AAEA,YAAM,eAAe,CAAC,WAA+B;AACjD,YAAI,KAAK,mBAAmB,QAAW;AACnC,2BAAiB,OAAO,UAAU;AAClC;QACJ;AAEA,mBAAW,YAAY,OAAO,YAAY;AACtC,cAAI,KAAK,gBAAgB,QAAQ,GAAG;AAChC,2BAAe,QAAQ;UAC3B;QACJ;MACJ;AAEA,WAAK,WACC,cAAc,KAAK,QAAQ,IAC3B,KAAK,WACH,cAAc,KAAK,QAAQ,IAC3B,KAAK,cACH,iBAAiB,KAAK,WAAW,IACjC,KAAK,UACH,aAAa,KAAK,OAAO,IACzB;AAEZ,WAAK,cAAc;AACnB,WAAK,WAAW;AAChB,WAAK,WAAW;AAChB,WAAK,kBAAkB;AACvB,WAAK,eAAe;AACpB,WAAK,gBAAgB;AACrB,WAAK,mBAAmB;AAExB,aAAO;IACX;;IAGA,SAAM;AACF,iBAAW,UAAU,KAAK,UAAU;AAChC,YAAI,CAAC,OAAO,eAAe,OAAM,GAAI;AACjC,cAAI;AACA,iBAAK,SAAS,QAAQ,KAAK,QAAQ,KAAK,SAAS;UACrD,SAAS,GAAQ;AACb,oBAAQ,EAAE,SAAS;cACf,KAAK,yDAAyD,KAAK,EAAE,OAAO,GAAG;cAC/E,KAAK;AACD;cACJ;AACI,sBAAM;YACd;UACJ;QACJ;MACJ;IACJ;;AA5OS,EAAAA,QAAA,SAAM;AAuQnB,WAAgB,MAAM,aAAsB,OAAK;AAC7C,UAAM,UAAU,MAA2B,CAAC,QAAQ,OAAO,aAAY;AACnE,YAAM,uBAAuB,OAAO,uBAAuB,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG;AAEvF,kBAAY,OAAO,OAAO,gBAAgB;QACtC,UAAO;AACH,cAAI,KAAK,YAAY,UAAU;AAE3B,kBAAM,OAAO,KAAK,YAAY,oBAAoB,WAAW,UAAK,OAAO,MAAM,OAAO,CAAC,uBAAa,OAAO,MAAM,KAAK,IAAI,YAAY,OAAO,IAAI,gBAAgB;UACrK;QACJ;QACA,UAAO;AACH,cAAI,KAAK,YAAY,UAAU;AAE3B,kBAAM,OAAO,KAAK,YAAY,oBAAoB,WAAW,UAAK,OAAO,EAAE,MAAM,KAAK,CAAC,uBAAa,OAAO,MAAM,KAAK,IAAI,YAAY,OAAO,IAAI,gBAAgB;AACjK,kBAAM,MAAK;UACf;QACJ;OACH;IACL;AAEA,UAAM,wBAAwB,MAA2B,CAAC,QAAQ,OAAO,aAAY;AACjF,YAAM,uBAAuB,OAAO,uBAAuB,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG;AAEvF,YAAM,sBAAsB,CAAC,OAAO;AAEpC,YAAM,WAAW,YAAwD,MAAW;AAChF,YAAK,KAA2B,YAAY,UAAU;AAClD,gBAAM,gBAAgB,OAAO,WAAW,SAAY,IAAIA,QAAO,UAAU,QAAQ,IAAI,OAAO,MAAM,IAAI;AACtG,gBAAMG,cAAa,gBAAgB,CAAC,aAAa,EAAE,OAAO,OAAO,UAAU,IAAI,OAAO;AAGtF,gBAAM,OAAO,KAAK,YAAY,oBAAoB,WAAW,UAAK,OAAO,MAAM,OAAO,CAAC,uBAAa,OAAO,MAAM,KAAK,IAAI,YAAY,OAAO,IAAI,kBAAkBA,YAAW,IAAI,OAAK,WAAW,EAAE,IAAI,qBAAqBH,QAAA,eAAe,KAAK,EAAE,WAAW,mBAAmB,GAAG,EAAE,IAAI,CAAC,SAAS,EAAE,KAAK,IAAI,CAAC,GAAG;QACvT;AAEA,cAAM,cAAc,OAAO,eAAe,GAAG,IAAI;AAEjD,YAAK,KAA2B,YAAY,UAAU;AAElD,gBAAM,OAAO,KAAK,YAAY,oBAAoB,WAAW,UAAK,OAAO,EAAE,MAAM,KAAK,CAAC,uBAAa,OAAO,MAAM,KAAK,IAAI,YAAY,OAAO,IAAI,iBAAiB,eAAe,SAAY,KAAK,cAAcA,QAAA,eAAe,aAAa,OAAO,UAAU,CAAC,EAAE,SAAS;AACzQ,gBAAM,MAAK;QACf;AAEA,eAAO;MACX;AAEA,aAAO,OAAM;AACb,YAAM,iBAAiB,IAAI,eAAe,UAAU,OAAO,WAAW,YAAY,OAAO,cAAc;AACvG,kBAAY,QAAQ,OAAO,gBAAgB,cAAc;IAC7D;AAEA,WAAO,IAAIA,QAAO,OAAO,aAAa,sBAAqB,IAAK,QAAO,CAAE;EAC7E;AApDgB,EAAAA,QAAA,QAAK;AAuDrB,WAAgB,UAAU,MAAiB;AACvC,UAAM,UAAUA,QAAO,OAAO,WACzB,QAAQ,OAAK,EAAE,MAAM,QAAQ,QAAQ,CAAAC,OAAKA,GAAE,QAAQ,OAAO,CAAAA,OAAK,CAACA,GAAE,eAAe,OAAM,CAAE,CAAC,CAAC,EAC5F,KAAK,CAAC,GAAG,OAAO,EAAE,eAAe,QAAQ,GAAG,cAAc,CAAC;AAEhE,UAAM,eAAe,CAAC,WAAwC;AAC1D,UAAI,OAAO;AACX,UAAI,QAAQ,QAAQ,SAAS;AAE7B,aAAO,QAAQ,OAAO;AAClB,cAAM,QAAQ,KAAK,OAAO,OAAO,SAAS,CAAC;AAC3C,cAAM,aAAa,QAAQ,KAAK,EAAE,eAAe,QAAQ,MAAM;AAE/D,YAAI,cAAc,GAAG;AACjB,iBAAO,QAAQ,KAAK;QACxB,WAAW,aAAa,GAAG;AACvB,kBAAQ,QAAQ;QACpB,OAAO;AACH,iBAAO,QAAQ;QACnB;MACJ;AACA,aAAO,QAAQ,KAAK;IACxB;AAEA,UAAM,UAAU,MAA2B,CAAC,QAAQ,OAAO,aAAY;AACnE,kBAAY,OAAO,OAAO,gBAAgB,WAAA;AACtC,YAAI,KAAK,YAAY,UAAU;AAC3B,gBAAM,UAAU,WAAW,OAAO,UAAU,KAAK,SAAS,IAAI;AAC9D,kBAAQ,QAAQ,OAAO,cAAc;AAErC,qBAAW,UAAU,SAAS;AAC1B,gBAAI,OAAO,QAAQD,QAAO,OAAO,IAAI,IAAI,KAAK,OAAO,QAAQA,QAAO,OAAO,KAAK,IAAIA,QAAO,OAAO,IAAI,CAAC,IAAI,GAAG;AAC1G,oBAAMI,UAAS,aAAa,MAAM;AAElC,kBAAIA,SAAQ;AACR,sBAAM,SAAS,OAAO,IAAIA,QAAO,cAAc;AAE/C,oBAAI,OAAO,QAAQ,IAAK,IAAI,GAAG;AAE3B,wBAAM,OAAO,KAAK,YAAYA,QAAO,uBAAuB,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG,CAAC,oBAAoB,OAAO,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG,CAAC,WAAWA,QAAO,MAAM,KAAK,IAAI,YAAYA,QAAO,IAAI,SAAS;gBACtN;cACJ;YACJ;UACJ;AAEA,gBAAM,MAAK;QACf;MACJ,CAAC;IACL;AAEA,WAAO,IAAIJ,QAAO,OAAO,QAAO,CAAE;EACtC;AAnDgB,EAAAA,QAAA,YAAS;AAoD7B,GAnXUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAaK,eAA+D,aAAY;;IAGpF,WAAW,aAAU;AACjB,aAAOL,QAAO,OAAO,MAAM,cAAc,EAAE;IAC/C;;IAGA,IAAI,WAAQ;AAMR,YAAMM,SAAQN,QAAO,OAAO,WAAW,EAAE,OAAO,OAAqB,eAAe,CAAC,EAAE,OAAM;AAG7F,YAAM,SAAS,OAAO,SAASM,OAAM,QAAQ,KAAM,uDAAuD,EAAE,CAAC,GAAG,SAAS,IAAIA,OAAM,MAAM,KAClI,MAAM,8DAA8D;AAG3E,aAAON,QAAO,MAAM,WAAW,YAAY,WAAA;AACvC,eAAO,IAAIA,QAAO,QAAQ,KAAK,OAAO,IAAI,MAAM,GAAG,KAAK,WAAW;MACvE,GAAG,IAAI;AAEP,aAAO,KAAK;IAChB;;IAIA,IAAI,cAAW;AACX,aAAO,KAAK,YAAY,MAAM;IAClC;;IAIA,IAAI,cAAW;AACX,aAAO,KAAK,OAAO,MAAM,KAAK,MAAM;IACxC;;IAIA,IAAI,SAAM;AACN,aAAOA,QAAO,QAAQ,eAAe,IAAI;IAC7C;;IAIA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAO,IAAI;IACjC;;IAGA,IAAI,OAAa;AACb,UAAI,QAAQ,KAAK,SAAS,KAAK,QAAQ;AACnC,cAAM,+BAA+B,KAAK,2BAA2B,KAAK,MAAM,EAAE;MACtF;AAEA,aAAO,KAAK,SAAS,IAAI,KAAK;IAClC;;IAGA,IAAI,OAAe,OAAQ;AACvB,UAAI,QAAQ,KAAK,SAAS,KAAK,QAAQ;AACnC,cAAM,+BAA+B,KAAK,2BAA2B,KAAK,MAAM,EAAE;MACtF;AAEA,WAAK,SAAS,IAAI,OAAO,KAAK;IAClC;;IAGA,WAAQ;AACJ,aAAO,KAAK,OAAM,IAAK,SAAS,IAAI,KAAK,SAAS,KAAK,KAAK,QAAQ,CAAC,CAAC;IAC1E;;IAGA,EAAE,OAAO,QAAQ,IAAC;AACd,eAAS,IAAI,GAAG,IAAI,KAAK,QAAQ,KAAK;AAClC,cAAM,KAAK,SAAS,IAAI,CAAC;MAC7B;IACJ;;AAlDA,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AA5CM,aAAA;IADN;;AAFQ,EAAAA,QAAA,QAAKK;AA0FlB,WAAgB,MAAmC,OAAqB,kBAA8B;AAClG,UAAM,SAAS,OAAO,oBAAoB,WAAW,mBAAmB,iBAAiB;AACzF,UAAMC,SAAQ,IAAIN,QAAO,MAASA,QAAO,QAAQ,SAAS,OAAO,MAAM,CAAC;AAExE,QAAI,WAAW,MAAM,QAAQ,gBAAgB,GAAG;AAC5C,MAAAM,OAAM,SAAS,MAAM,gBAAgB;IACzC;AAEA,WAAOA;EACX;AATgB,EAAAN,QAAA,QAAK;AAUzB,GArGUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,MAAa,WAAb,MAAa,iBAAiB,aAAY;;IAEtC,IAAI,QAAK;AACL,UAAIA,QAAO,QAAQ,iBAAiB,OAAM,GAAI;AAU1C,cAAM,gBACF,KAAK,OACA,UAAyB,WAAW,CAAC,GACpC,OAAOA,QAAO,OAAO,UAAU,CAAC,GAChC,WAAU,GACV,UAAyB,YAAY,GACrC,OAAM,KACZ,KAAK,OAAO,UAAuC,cAAc,CAAC,GAAG,OAAO,KAAK,GAAG,IAAI,CAAC,KACzF,MAAM,uDAAuD,KAAK,IAAI,EAAE;AAE5E,eAAO,IAAIA,QAAO,MAAM,cAAc,MAAqB,OAAO,EAAE,KAAK;MAC7E;AAEA,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,iBAAiB,IAAI,CAAC;IACjE;;IAIA,IAAI,OAAI;AACJ,aAAO,KAAK,MAAM,KAAK,QAAQ,QAAQ,EAAE;IAC7C;;IAIA,IAAI,SAAM;AACN,iBAAW,KAAKA,QAAO,OAAO,OAAO,OAAoC,iBAAiB,CAAC,EAAE,OAAO,KAAK,GAAG;AACxG,YAAI,EAAE,MAAqB,gBAAgB,EAAE,MAAM,OAAO,IAAI,GAAG;AAC7D,iBAAO;QACX;MACJ;AAEA,YAAM,wDAAwD;IAClE;;AAdA,aAAA;IADC;;AAOD,aAAA;IADC;;AApCQ,aAAQ,WAAA;IADpB;KACY,QAAQ;AAAR,EAAAA,QAAA,WAAQ;AA+CzB,GAjDUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,MAAa,QAAb,MAAa,cAAc,aAAY;;IAEnC,IAAI,qBAAkB;AAClB,YAAM,eAAeA,QAAO,OAAO,MAAM,eAAe;AAGxD,YAAM,SAAS,aAAa,OAAO,SAAS,OAAK,EAAE,QAAO,KAAM,aAAa,eAAe,CAAC,KACtF,MAAM,0EAA0E;AAGvF,aAAOA,QAAO,MAAM,WAAW,sBAAsB,WAAA;AACjD,eAAO,KAAK,OAAO,IAAI,MAAM,EAAE,QAAO;MAC1C,GAAG,IAAI;AAEP,aAAO,KAAK;IAChB;;IAIA,IAAI,aAAU;AACV,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,mBAAmB,MAAM,CAAC,CAAC;IACtE;;IAIA,IAAI,mBAAgB;AAChB,aAAOA,QAAO,QAAQ,yBAAyB,IAAI;IACvD;;IAIA,IAAI,eAAY;AACZ,aAAOA,QAAO,QAAQ,qBAAqB,IAAI,EAAE,eAAc,EAAI,QAAQ,QAAQ,EAAE;IACzF;;IAIA,IAAI,iBAAc;AACd,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,sBAAsB,IAAI,CAAC,EAAE,WAAU;IAClF;;IAIA,IAAI,WAAQ;AACR,aAAO,IAAIA,QAAO,KAAKA,QAAO,QAAQ,iBAAiB,IAAI,CAAC,EAAE,WAAU;IAC5E;;IAIA,IAAI,eAAY;AACZ,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,qBAAqB,IAAI,CAAC,EAAE,WAAU;IACjF;;IAIA,IAAI,SAAM;AACN,aAAO,mBAAmB,OAAKA,QAAO,QAAQ,eAAe,MAAM,CAAC,CAAC,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAM,CAAC,CAAC;IACvG;;IAIA,IAAI,QAAK;AACL,aAAOA,QAAO,QAAQ,cAAc,IAAI;IAC5C;;IAIA,IAAI,WAAQ;AACR,aAAO,KAAK,YAAY,GAAG,KAAK,SAAS,IAAI,KAAK,IAAI,KAAK,KAAK;IACpE;;IAGA,IAAI,eAAY;AAMZ,YAAM,QAAQ,KAAK,MAAM,SAAS,KAAK,QAAQ,GAAG,WAAU;AAC5D,aAAO,OAAO,OAAO,IAAI,IAAI,OAAO,SAAS;IACjD;;IAIA,IAAI,WAAQ;AACR,UAAI,CAAC,KAAK,aAAa,CAAC,KAAK,YAAY;AACrC,eAAO,CAAA;MACX;AAEA,YAAM,QAAQ,KAAK,KAAK,OAAO,OAAoC,qBAAqB,EAAE,OAAM;AAChG,aAAO,WAAW,MAAM,KAAK,KAAK,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAMA,QAAO,QAAQ,gBAAgB,CAAC,CAAC,CAAC;IACpG;;IAIA,IAAI,gBAAa;AACb,aAAO,CAAC,CAACA,QAAO,QAAQ,mBAAmB,IAAI;IACnD;;IAIA,IAAI,uBAAoB;AACpB,YAAM,oBAAoB,KAAK,UAAU,QAAQ;AACjD,aAAO,qBAAqB,QAAQ,CAAC,kBAAkB,eAAe,OAAM;IAChF;;IAIA,IAAI,QAAK;AACL,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,cAAc,IAAI,CAAC;IAC9D;;IAIA,IAAI,eAAY;AACZ,aAAOA,QAAO,QAAQ,qBAAqB,IAAI;IACnD;;IAIA,IAAI,aAAU;AACV,aAAO,CAAC,CAACA,QAAO,QAAQ,gBAAgB,IAAI;IAChD;;IAIA,IAAI,cAAW;AACX,aAAO,CAAC,CAACA,QAAO,QAAQ,iBAAiB,IAAI;IACjD;;IAIA,IAAI,SAAM;AACN,aAAO,CAAC,CAACA,QAAO,QAAQ,YAAY,IAAI;IAC5C;;IAIA,IAAI,YAAS;AACT,aAAO,CAAC,CAACA,QAAO,QAAQ,eAAe,IAAI;IAC/C;;IAIA,IAAI,aAAU;AACV,aAAO,CAAC,CAACA,QAAO,QAAQ,gBAAgB,IAAI;IAChD;;IAIA,IAAI,cAAW;AACX,aAAO,CAAC,CAACA,QAAO,QAAQ,iBAAiB,IAAI;IACjD;;IAGA,IAAI,WAAQ;AACR,aAAO,KAAK,eAAe,CAAC,KAAK;IACrC;;IAIA,IAAI,cAAW;AACX,aAAO,CAAC,CAACA,QAAO,QAAQ,iBAAiB,IAAI;IACjD;;IAIA,IAAI,aAAU;AACV,aAAO,mBAAmB,OAAKA,QAAO,QAAQ,mBAAmB,MAAM,CAAC,CAAC,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAM,CAAC,CAAC;IAC3G;;IAIA,IAAI,UAAO;AACP,aAAO,mBAAmB,OAAKA,QAAO,QAAQ,gBAAgB,MAAM,CAAC,CAAC,EAAE,IAAI,OAAK,IAAIA,QAAO,OAAO,CAAC,CAAC;IACzG;;IAIA,IAAI,OAAI;AACJ,aAAOA,QAAO,QAAQ,aAAa,IAAI,EAAE,eAAc;IAC3D;;IAIA,IAAI,YAAS;AACT,aAAOA,QAAO,QAAQ,kBAAkB,IAAI,EAAE,eAAc,KAAO;IACvE;;IAIA,IAAI,gBAAa;AACb,aAAO,mBAAmB,OAAKA,QAAO,QAAQ,sBAAsB,MAAM,CAAC,CAAC,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAM,CAAC,CAAC;IAC9G;;IAIA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,eAAe,IAAI,CAAC,EAAE,WAAU;IAC3E;;IAIA,IAAI,eAAY;AACZ,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,gBAAgB,KAAK,KAAK,OAAO,OAAsB,iBAAiB,EAAE,OAAM,CAAE,CAAC;IAC9H;;IAIA,IAAI,OAAI;AACJ,UAAI,OAAO;AACX,YAAM,OAAO,KAAK;AAElB,eAAS,IAAI,KAAK,KAAK,SAAS,GAAG,IAAI,GAAG,KAAK;AAC3C,cAAM,IAAI,KAAK,CAAC;AAEhB,YAAI,KAAK;AAAK;iBACL,KAAK,OAAO,QAAQ;AAAG;iBACvB,KAAK;AAAK;;AACd;MACT;AAEA,aAAO;IACX;;IAIA,IAAI,mBAAgB;AAChB,aAAOA,QAAO,QAAQ,wBAAwB,IAAI;IACtD;;IAIA,IAAI,gBAAa;AACb,aAAOA,QAAO,QAAQ,sBAAsB,MAAM,IAAI;IAC1D;;IAIA,IAAI,OAAI;AACJ,aAAO,IAAIA,QAAO,KAAKA,QAAO,QAAQ,aAAa,IAAI,CAAC;IAC5D;;IAGA,QAAK;AACD,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,UAAU,IAAI,CAAC;IAC3D;;IAGA,MAAmC,MAAY;AAC3C,aAAO,KAAK,SAAY,IAAI,KAAK,MAAM,uBAAuB,IAAI,aAAa,KAAK,KAAK,IAAI,EAAE;IACnG;;IAGA,CAAC,UAAU,SAAsC;AAC7C,UAAI,QAA6B,SAAS,kBAAkB,OAAO,OAAO,KAAK;AAC/E,aAAO,OAAO;AACV,cAAM;AACN,gBAAQ,MAAM;MAClB;IACJ;;IAGA,WAAW,SAAuB;AAC9B,UAAI,CAAC,KAAK,WAAW;AACjB,cAAM,wBAAwB,KAAK,KAAK,IAAI,kCAAkC;MAClF;AAEA,UAAI,KAAK,SAAS,UAAU,QAAQ,QAAQ;AACxC,cAAM,wBAAwB,KAAK,KAAK,IAAI,gBAAgB,KAAK,SAAS,MAAM,8BAA8B,QAAQ,MAAM,EAAE;MAClI;AAEA,YAAM,QAAQ,QAAQ,IAAI,OAAK,EAAE,KAAK,MAAM;AAC5C,YAAM,YAAYA,QAAO,MAAMA,QAAO,OAAO,MAAM,aAAa,GAAG,KAAK;AAExE,YAAM,eAAe,KAAK,KAAK,OAAO,OAAsB,mBAAmB,CAAC,EAAE,OAAO,SAAS;AAClG,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,gBAAgB,YAAY,CAAC;IACxE;;IAGA,aAAU;AACN,MAAAA,QAAO,QAAQ,gBAAgB,IAAI;AACnC,aAAO;IACX;;IAGA,iBAAiB,OAAmB;AAChC,aAAO,CAAC,CAACA,QAAO,QAAQ,sBAAsB,MAAM,KAAK;IAC7D;;IAGA,aAAa,OAAqB,iBAAwB;AACtD,aAAO,CAAC,CAACA,QAAO,QAAQ,kBAAkB,MAAM,OAAO,CAAC,eAAe;IAC3E;;IAGA,OAA2C,MAAc,iBAAyB,IAAE;AAChF,aAAO,KAAK,UAAa,MAAM,cAAc,KAAK,MAAM,wBAAwB,IAAI,aAAa,KAAK,KAAK,IAAI,EAAE;IACrH;;IAGA,OAAO,MAAY;AACf,aAAO,KAAK,UAAU,IAAI,KAAK,MAAM,8BAA8B,IAAI,aAAa,KAAK,KAAK,IAAI,EAAE;IACxG;;IAGA,MAAG;AACC,YAAM,SAAS,KAAK,MAAK;AAEzB,YAAM,iBAAiB,OAAO,MAAM,QAAQ,WAAW;AAEvD,MAAAA,QAAO,QAAQ,iBAAiB,QAAQ,cAAc;AAEtD,YAAM,YAAY,eAAe,YAAW;AAE5C,UAAI,CAAC,UAAU,OAAM,GAAI;AACrB,cAAM,IAAIA,QAAO,OAAO,SAAS,EAAE,SAAQ,CAAE;MACjD;AAEA,aAAO;IACX;;IAGA,SAAsC,MAAY;AAC9C,aAAO,IAAIA,QAAO,MAASA,QAAO,QAAQ,sBAAsB,MAAM,OAAO,gBAAgB,IAAI,CAAC,CAAC,EAAE,WAAU;IACnH;;IAGA,UAA8C,MAAc,iBAAyB,IAAE;AACnF,aAAO,IAAIA,QAAO,OAAUA,QAAO,QAAQ,uBAAuB,MAAM,OAAO,gBAAgB,IAAI,GAAG,cAAc,CAAC,EAAE,WAAU;IACrI;;IAGA,UAAU,MAAY;AAClB,aAAO,KAAK,cAAc,KAAK,OAAK,EAAE,QAAQ,IAAI;IACtD;;IAGA,WAAQ;AACJ,YAAM,YAAY,CAAC,KAAK,MAAM,EAAE,OAAO,KAAK,UAAU;AAEtD,aAAO,MACd,KAAK,YAAY;EACpB,KAAK,SAAS,SAAS,KAAK,WAAW,WAAW,KAAK,cAAc,cAAc,OAAO,IAC1F,KAAK,KAAK,IAAI,GACd,YAAY,MAAM,UAAU,IAAI,OAAK,GAAG,KAAK,IAAI,EAAE,KAAK,IAAI,CAAC,KAAK,EAAE;;MAEhE,KAAK,OAAO,KAAK;KAAQ,CAAC;MAC1B,KAAK,QAAQ,KAAK;KAAQ,CAAC;;IAEzB;;IAGA,OAAO,UAAU,OAAoC;AACjD,YAAM,WAAW,IAAI,eAAe,OAAK,MAAM,IAAIA,QAAO,MAAM,CAAC,CAAC,GAAG,QAAQ,CAAC,WAAW,SAAS,CAAC;AACnG,aAAOA,QAAO,QAAQ,aAAa,UAAU,IAAI;IACrD;;AAjVA,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAkBD,aAAA;IADC;;AAYD,aAAA;IADC;;AAOD,aAAA;IADC;;AAQD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAYD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAmBD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AA9OQ,UAAK,WAAA;IADjB;KACY,KAAK;AAAL,EAAAA,QAAA,QAAK;AAsWtB,GAxWUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,WAAgB,SACZ,OACA,OAAwB;AAExB,UAAM,iBAAiBA,QAAO,OAAO,MAAM,iBAAiB;AAC5D,UAAM,0BAA0BA,QAAO,OAAO,MAAM,0BAA0B;AAE9E,QAAI,CAAC,eAAe,iBAAiB,KAAK,GAAG;AACzC,YAAM,gCAAgC,MAAM,KAAK,IAAI,+BAA+B;IACxF;AAEA,QAAI,MAAM,OAAO,cAAc,KAAK,MAAM,OAAO,uBAAuB,GAAG;AACvE,YAAM,wCAAwC,eAAe,KAAK,IAAI,QAAQ,wBAAwB,KAAK,IAAI,0BAA0B;IAC7I;AAEA,UAAMO,YAAW,MAAM,MAAK;AAC5B,UAAM,MAAMA,UAAS,OAAO,SAAQ;AAEpC,UAAM,SAASA,UAAS,UAAU,QAAQ,KAAK,MAAM,gCAAgC,MAAM,KAAK,IAAI,6BAA6B;AACjI,IAAAA,UAAS,OAAO,OAAO,EAAE,OAAOA,WAAU,OAAO,MAAM;AAEvD,UAAM,WAAW,OAAO,KAAK,KAAY;AAEzC,IAAAA,UAAS,MAAM,YAAY,EAAE,QAAQ;AACrC,IAAAA,UAAS,MAAM,aAAa,EAAE,QAAQ;AACtC,IAAAP,QAAA,sBAAsB,GAAG,IAAI;AAE7B,WAAOO;EACX;AA5BgB,EAAAP,QAAA,WAAQ;AA+BX,EAAAA,QAAA,wBAAgF,CAAA;AACjG,GAlCUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,MAAa,SAAb,MAAa,eAAe,aAAY;;IAGpC,IAAI,aAAU;AACV,UAAI,UAAU,eAAe,OAAKA,QAAO,QAAQ,oBAAoB,MAAM,CAAC,CAAC;AAE7E,UAAI,QAAQ,UAAU,GAAG;AACrB,cAAM,kBAAkB,KAAK,OAAO,OAAoC,eAAe,EAAE,SAAQ,EAAG,OAAM;AAC1G,kBAAU,WAAW,MAAM,KAAK,eAAe,EAAE,IAAI,OAAK,EAAE,MAAqB,gBAAgB,EAAE,KAAK;MAC5G;AAEA,aAAO,QAAQ,IAAI,OAAK,IAAIA,QAAO,SAAS,CAAC,CAAC;IAClD;;IAIA,IAAI,SAAM;AACN,aAAOA,QAAO,OAAO,MAAM,kBAAkB,EAAE,OAAsB,mBAAmB,EAAE,OAAM;IACpG;;IAGA,SAAS,MAAY;AACjB,aAAO,KAAK,YAAY,IAAI,KAAK,MAAM,0BAA0B,IAAI,EAAE;IAC3E;;IAGA,SAAM;AACF,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,aAAa,IAAI,CAAC;IAC9D;;IAGA,YAAY,MAAY;AACpB,aAAO,IAAIA,QAAO,SAASA,QAAO,QAAQ,0BAA0B,MAAM,OAAO,gBAAgB,IAAI,CAAC,CAAC,EAAE,WAAU;IACvH;;AA9BA,aAAA;IADC;;AAcD,aAAA;IADC;;AAfQ,WAAM,WAAA;IADlB;KACY,MAAM;AAAN,EAAAA,QAAA,SAAM;AAuCnB,SAAOA,SAAQ,UAAU,MAAK;AAC1B,WAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,UAAS,CAAE;EACvD,GAAG,IAAI;AACX,GA5CUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,cAA+D,aAAY;;IAGpF,IAAI,QAAK;AACL,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,cAAc,IAAI,CAAC;IAC9D;;IAIA,IAAI,QAAK;AACL,aAAOA,QAAO,QAAQ,cAAc,IAAI;IAC5C;;IAIA,IAAI,YAAS;AACT,cAAQ,KAAK,QAAK,OAAuC;IAC7D;;IAIA,IAAI,WAAQ;AACR,cAAQ,KAAK,QAAK,OAAsC;IAC5D;;IAIA,IAAI,iBAAc;AACd,YAAM,SAASA,QAAO,OAAO,MAAM,kBAAkB,EAAE,MAAM,0BAA0B,EAAE;AAGzF,aAAOA,QAAO,MAAM,WAAW,kBAAkB,WAAA;AAC7C,eAAO,KAAK,UAAU;MAC1B,GAAG,IAAI;AAEP,aAAO,KAAK;IAChB;;IAIA,IAAI,WAAQ;AACR,cAAQ,KAAK,QAAK,GAA4C;QAC1D,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;MACf;IACJ;;IAIA,IAAI,OAAI;AACJ,aAAOA,QAAO,QAAQ,aAAa,IAAI,EAAE,eAAc;IAC3D;;IAIA,IAAI,SAAM;AACN,aAAOA,QAAO,QAAQ,eAAe,IAAI;IAC7C;;IAIA,IAAI,OAAI;AACJ,aAAO,IAAIA,QAAO,KAAKA,QAAO,QAAQ,aAAa,IAAI,CAAC;IAC5D;;IAGA,IAAI,QAAK;AACL,UAAI,CAAC,KAAK,UAAU;AAChB,cAAM,gCAAgC,KAAK,MAAM,KAAK,IAAI,KAAK,KAAK,IAAI,sCAAsC;MAClH;AAEA,YAAM,SAAS,OAAO,MAAM,QAAQ,WAAW;AAC/C,MAAAA,QAAO,QAAQ,oBAAoB,KAAK,QAAQ,MAAM;AAEtD,aAAOA,QAAA,KAAK,QAAQ,KAAK,IAAI;IACjC;;IAGA,IAAI,MAAM,OAAQ;AACd,UAAI,CAAC,KAAK,UAAU;AAChB,cAAM,gCAAgC,KAAK,MAAM,KAAK,IAAI,KAAK,KAAK,IAAI,sCAAsC;MAClH;AAEA,UAAI,KAAK,kBAAkB,KAAK,WAAW;AACvC,cAAM,mCAAmC,KAAK,IAAI,mCAAmC;MACzF;AAEA,YAAM;;;QAGF,iBAAiBA,QAAO,UAAU,KAAK,KAAK,MAAM,cAC5C,MAAM,MAAK,IACX,iBAAiB,eACjB,MAAM,SACN,iBAAiB,gBACjB,QACAA,QAAA,MAAM,OAAO,MAAM,KAAK,KAAK,MAAM,aAAa,GAAG,OAAO,KAAK,IAAI;;AAE7E,MAAAA,QAAO,QAAQ,oBAAoB,KAAK,QAAQ,MAAM;IAC1D;;IAGA,WAAQ;AACJ,aAAO,GACjB,KAAK,iBAAiB,oBAAoB,EAAE,GAC5C,KAAK,WAAW,YAAY,EAAE,GAC9B,KAAK,KAAK,IAAI,IACd,KAAK,IAAI,GACT,KAAK,YAAY,MAAM,KAAK,KAAK,MAAM,SAASA,QAAA,KAAM,KAAK,MAA2B,QAAQ,KAAK,KAAK,MAAM,QAAS,IAAI,KAAK,KAAK,KAAK,EAAE,IAC5I,KAAK,kBAAkB,KAAK,YAAY,KAAK,SAAS,KAAK,OAAO,SAAS,EAAE,CAAC,EAAE;IAC1E;;;;;;;;;IAUA,KAAK,UAA0C;AAC3C,UAAI,KAAK,UAAU;AACf,cAAM,4BAA4B,KAAK,MAAM,KAAK,IAAI,KAAK,KAAK,IAAI,iBAAiB;MACzF;AAEA,YAAM,SAAS,KAAK,UAAU,oBAAoBA,QAAO,YAAYA,QAAO,OAAO,aAAa;AAEhG,aAAO,IAAI,MAAM,MAAM;QACnB,IAAI,QAAyB,UAA4B;AACrD,cAAI,YAAY,SAAS;AACrB,mBAAOA,QAAA,KAAK,SAAS,OAAO,IAAI,MAAM,GAAG,OAAO,IAAI;UACxD;AACA,iBAAO,QAAQ,IAAI,QAAQ,QAAQ;QACvC;QAEA,IAAI,QAAyB,UAA8B,OAAU;AACjE,cAAI,YAAY,SAAS;AACrB,YAAAA,QAAA,MAAM,SAAS,OAAO,IAAI,MAAM,GAAG,OAAO,OAAO,IAAI;AACrD,mBAAO;UACX;AAEA,iBAAO,QAAQ,IAAI,QAAQ,UAAU,KAAK;QAC9C;OACH;IACL;;AAvJA,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAcD,aAAA;IADC;;AAoBD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAtEQ,EAAAA,QAAA,QAAK;AA6MtB,GA9MUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,SAAQ;IAEI;;IAArB,YAAqB,QAAc;AAAd,WAAA,SAAA;IAAiB;;IAGtC,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,kBAAkB,KAAK,MAAM,CAAC,EAAE,WAAU;IACtF;;IAGA,OAAI;AACA,aAAOA,QAAO,QAAQ,aAAa,KAAK,MAAM;IAClD;;AAZS,EAAAA,QAAA,WAAQ;AAczB,GAfUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,MAAa,QAAb,MAAa,cAAc,aAAY;;IAGnC,IAAI,WAAQ;AACR,aAAO,IAAIA,QAAO,SAASA,QAAO,QAAQ,iBAAiB,IAAI,CAAC;IACpE;;IAIA,IAAI,aAAU;AACV,UAAIA,QAAO,QAAQ,mBAAmB,OAAM,GAAI;AAC5C,eAAO,KAAK,QAAQ;MACxB,OAAO;AACH,eAAOA,QAAO,QAAQ,mBAAmB,IAAI;MACjD;IACJ;;IAIA,IAAI,UAAO;AACP,UAAIA,QAAO,QAAQ,cAAc,OAAM,GAAI;AACvC,cAAM,QAAQ,KAAK,SAAS,OAAO,OAAoC,UAAU,EAAE,OAAO,KAAK;AAI/F,cAAM,UAAU,WAAW,MAAM,KAAK,OAAO,OAAK,IAAIA,QAAO,MAAMA,QAAO,QAAQ,gBAAgB,CAAC,CAAC,CAAC;AAIrG,cAAM,SAAS,KAAK,SAAS,UAAU;AACvC,YAAI,QAAQ;AACR,kBAAQ,QAAQ,MAAM;QAC1B;AAEA,eAAO;MACX,OAAO;AACH,eAAO,WAAW,MAAM,KAAK,WAAW,MAAM,KAAK,UAAU,GAAG,CAAC,GAAG,MAAM,IAAIA,QAAO,MAAMA,QAAO,QAAQ,cAAc,MAAM,CAAC,CAAC,CAAC;MACrI;IACJ;;IAIA,IAAI,OAAI;AACJ,aAAOA,QAAO,QAAQ,aAAa,IAAI,EAAE,eAAc;IAC3D;;IAGA,MAAM,MAAY;AACd,aAAO,KAAK,SAAS,IAAI,KAAK,MAAM,uBAAuB,IAAI,gBAAgB,KAAK,IAAI,EAAE;IAC9F;;IAGA,SAAS,MAAY;AACjB,YAAM,WAAW,KAAK,YAAY,GAAG;AACrC,YAAM,iBAAiB,OAAO,gBAAgB,YAAY,KAAK,KAAK,KAAK,MAAM,GAAG,QAAQ,CAAC;AAC3F,YAAM,YAAY,OAAO,gBAAgB,KAAK,MAAM,WAAW,CAAC,CAAC;AAEjE,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,cAAc,MAAM,gBAAgB,SAAS,CAAC,EAAE,WAAU;IACrG;;AAvDA,aAAA;IADC;;AAOD,aAAA;IADC;;AAWD,aAAA;IADC;;AAwBD,aAAA;IADC;;AAzCQ,UAAK,WAAA;IADjB;KACY,KAAK;AAAL,EAAAA,QAAA,QAAK;AAgElB,SAAOA,SAAQ,UAAU,MAAK;AAC1B,WAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,UAAS,CAAE;EACtD,GAAG,IAAI;AACX,GArEUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,uBAAuB,aAAY;;IAE5C,OAAO,UAAO;AACV,aAAO,IAAIA,QAAO,eAAc;IACpC;;IAGA,YAAY,SAAwBA,QAAO,QAAQ,sBAAqB,GAAE;AACtE,YAAM,MAAM;IAChB;;IAIA,IAAI,UAAO;AACP,aAAO,mBAAmB,OAAKA,QAAO,QAAQ,yBAAyB,MAAM,CAAC,CAAC,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAM,CAAC,CAAC;IACjH;;IAIA,IAAI,UAAO;AAEP,aAAO,eAAe,OAAKA,QAAO,QAAQ,yBAAyB,MAAM,CAAC,CAAC,EAAE,OAAO,OAAK,CAAC,EAAE,OAAM,CAAE,EAAE,IAAI,OAAK,IAAIA,QAAO,OAAO,CAAC,CAAC;IACvI;;IAGA,OAAI;AACA,MAAAA,QAAO,QAAQ,mBAAmB,IAAI;IAC1C;;AAdA,aAAA;IADC;;AAOD,aAAA;IADC;;AAlBQ,EAAAA,QAAA,iBAAc;AA+B3B,WAAgB,eAAkB,OAAiE;AAC/F,UAAMQ,kBAAiBR,QAAO,eAAe,QAAO;AACpD,UAAM,SAAS,MAAMQ,eAAc;AACnC,IAAAA,gBAAe,KAAI;AACnB,WAAO;EACX;AALgB,EAAAR,QAAA,iBAAc;AAMlC,GAtCUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,eAA8E,aAAY;;IAGnG,IAAI,QAAK;AACL,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,eAAe,IAAI,CAAC;IAC/D;;IAIA,IAAI,QAAK;AACL,aAAOA,QAAO,QAAQ,eAAe,MAAM,IAAI;IACnD;;IAIA,IAAI,sBAAmB;AACnB,YAAM,6BAA6B,OAAO,MAAM,QAAQ,WAAW;AACnE,MAAAA,QAAO,QAAQ,eAAe,MAAM,0BAA0B;AAE9D,aAAO,2BAA2B,QAAO;IAC7C;;IAIA,IAAI,iBAAc;AACd,YAAM,QAAsC,CAAA;AAE5C,iBAAW,aAAa,KAAK,YAAY;AACrC,cAAM,KAAK,UAAU,KAAK,UAAU;MACxC;AAEA,UAAI,KAAK,gCAAgC;AACrC,cAAM,QAAQ,SAAS;MAC3B;AAEA,UAAI,KAAK,YAAY;AACjB,cAAM,KAAK,SAAS;MACxB;AAEA,aAAO;IACX;;IAIA,IAAI,WAAQ;AACR,UAAI,CAAC,KAAK,WAAW;AACjB,eAAO,CAAA;MACX;AAEA,YAAM,QAAQ,KAAK,OAAO,OAAoC,qBAAqB,EAAE,OAAM;AAC3F,aAAO,WAAW,MAAM,KAAK,KAAK,EAAE,IAAI,OAAK,IAAIA,QAAO,MAAMA,QAAO,QAAQ,gBAAgB,CAAC,CAAC,CAAC;IACpG;;IAIA,IAAI,aAAU;AACV,cAAQ,KAAK,sBAAmB,SAA0D;IAC9F;;IAIA,IAAI,YAAS;AACT,aAAO,CAAC,CAACA,QAAO,QAAQ,gBAAgB,IAAI;IAChD;;IAIA,IAAI,aAAU;AACV,aAAO,CAAC,CAACA,QAAO,QAAQ,iBAAiB,IAAI;IACjD;;IAIA,IAAI,WAAQ;AACR,aAAO,CAACA,QAAO,QAAQ,iBAAiB,IAAI;IAChD;;IAIA,IAAI,iBAAc;AACd,cAAQ,KAAK,sBAAmB,OAA0D;IAC9F;;IAIA,IAAI,WAAQ;AACR,cAAQ,KAAK,QAAK,GAA8C;QAC5D,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;QACX,KAAA;AACI,iBAAO;MACf;IACJ;;IAIA,IAAI,OAAI;AACJ,aAAOA,QAAO,QAAQ,cAAc,IAAI,EAAE,eAAc;IAC5D;;IAIA,IAAI,iBAAc;AACd,aAAO,IAAI,eAAe,KAAK,gBAAgB,KAAK,WAAW,YAAY,KAAK,cAA8C;IAClI;;IAGA,IAAI,iCAA8B;AAC9B,aAAO,CAAC,KAAK,YAAY,kCAAiC;IAC9D;;IAIA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,gBAAgB,MAAM,IAAI,CAAC;IACvE;;IAIA,IAAI,iBAAc;AACd,aAAOA,QAAO,QAAQ,wBAAwB,IAAI;IACtD;;IAIA,IAAI,aAAU;AACV,aAAO,WAAW,MAAM,KAAK,WAAW,MAAM,KAAK,cAAc,GAAG,CAAC,GAAG,MAAK;AACzE,cAAM,gBAAgBA,QAAO,QAAQ,uBAAuB,MAAM,CAAC,EAAE,eAAc;AACnF,cAAM,gBAAgBA,QAAO,QAAQ,uBAAuB,MAAM,CAAC;AACnE,eAAO,IAAIA,QAAO,UAAU,eAAe,GAAG,IAAIA,QAAO,KAAK,aAAa,CAAC;MAChF,CAAC;IACL;;IAIA,IAAI,yBAAsB;AACtB,aAAO,KAAK,eAAe,IAAIA,QAAO,OAAO,IAAI;IACrD;;IAIA,IAAI,aAAU;AACV,aAAO,IAAIA,QAAO,KAAKA,QAAO,QAAQ,oBAAoB,IAAI,CAAC;IACnE;;IAGA,IAAI,iBAAc;AACd,YAAM,SAAS,qBAAoB;AAGnC,aAAOA,QAAO,OAAO,WAAW,kBAAkB,WAAA;AAC9C,eAAO,KAAK,OAAO,IAAI,MAAM,EAAE,YAAW;MAC9C,GAAG,IAAI;AAQP,MAAAA,QAAO,OAAO,MAAM,0BAA0B,EAAE,OAAO,QAAQ,EAAE,OAAM;AAEvE,aAAO,KAAK;IAChB;;IAGA,IAAI,eAAe,OAA2G;AAC1H,UAAI;AACA,oBAAY,QAAQ,KAAK,gBAAgB,KAAK,KAAK,KAAK,CAAC;MAC7D,SAAS,GAAQ;AACb,gBAAQ,EAAE,SAAS;UACf,KAAK;AACD,kBAAM,0CAA0C,KAAK,IAAI,mCAAmC;UAChG,KAAK,yDAAyD,KAAK,EAAE,OAAO,GAAG;AAC3E,iBAAK,0CAA0C,KAAK,IAAI,uBAAuB;AAC/E;UACJ,KAAK;AACD,iBAAK,0CAA0C,KAAK,IAAI,6CAA6C;AACrG;UACJ;AACI,kBAAM;QACd;MACJ;IACJ;;IAGA,WAAmD,SAAuB;AACtE,UAAI,CAAC,KAAK,aAAa,KAAK,SAAS,UAAU,QAAQ,QAAQ;AAC3D,mBAAW,UAAU,KAAK,UAAS,GAAI;AACnC,cAAI,OAAO,aAAa,OAAO,SAAS,UAAU,QAAQ,QAAQ;AAC9D,mBAAO,OAAO,QAAQ,GAAG,OAAO;UACpC;QACJ;AACA,cAAM,iDAAiD,KAAK,IAAI,SAAS,QAAQ,MAAM,uBAAuB;MAClH;AAEA,YAAM,QAAQ,QAAQ,IAAI,OAAK,EAAE,KAAK,MAAM;AAC5C,YAAM,YAAYA,QAAO,MAAMA,QAAO,OAAO,MAAM,aAAa,GAAG,KAAK;AAExE,YAAM,uBAAuB,KAAK,OAAO,OAAsB,qBAAqB,CAAC,EAAE,OAAO,SAAS;AACvG,aAAO,IAAIA,QAAO,OAAO,qBAAqB,MAAqB,SAAS,EAAE,KAAK;IACvF;;IAGA,UAAU,YAAmC;AACzC,UAAI,CAAC,KAAK,UAAU;AAChB,cAAM,mCAAmC,KAAK,IAAI,qEAAqE;MAC3H;AACA,aAAO,KAAK,UAAU,MAAM,GAAG,UAAU;IAC7C;;IAGA,UAAU,aAAiC,YAAmC;AAC1E,YAAM,sBAAsB,WAAW,IAAIA,QAAA,YAAY;AAEvD,UAAI,KAAK,gCAAgC;AACrC,4BAAoB,QAAQ,QAAQ;MACxC;AAEA,UAAI,KAAK,YAAY;AACjB,4BAAoB,KAAK,KAAK,MAAM;MACxC;AAEA,UAAI;AACA,cAAM,cAAc,KAAK,eAAe,GAAG,mBAAmB;AAC9D,eAAOA,QAAA,eAAe,aAAa,KAAK,UAAU;MACtD,SAAS,GAAQ;AACb,YAAI,KAAK,MAAM;AACX,gBAAM,6FAA6F;QACvG;AAEA,gBAAQ,EAAE,SAAS;UACf,KAAK;AACD,kBAAM,0BAA0B,KAAK,IAAI,gBAAgB,KAAK,cAAc,sBAAsB,WAAW,MAAM,EAAE;UACzH,KAAK;UACL,KAAK;UACL,KAAK;AACD,kBAAM,0BAA0B,KAAK,IAAI,kCAAkC;QACnF;AAEA,cAAM;MACV;IACJ;;IAGA,YAAY,oBAA6C;AACrD,YAAM,SAAS,KAAK,YAAe,GAAG,kBAAkB;AACxD,aACI,UAAU,MAAM,mCAAmC,KAAK,IAAI,IAAI,mBAAmB,IAAI,OAAM,aAAaA,QAAO,QAAQ,EAAE,KAAK,OAAO,CAAE,CAAC,GAAG;IAErJ;;IAGA,CAAC,YAAS;AACN,iBAAW,SAAS,KAAK,MAAM,UAAS,GAAI;AACxC,mBAAW,UAAU,MAAM,SAAS;AAChC,cAAI,KAAK,QAAQ,OAAO,MAAM;AAC1B,kBAAM;UACV;QACJ;MACJ;IACJ;;IAGA,UAAU,MAAY;AAClB,aAAO,KAAK,aAAa,IAAI,KAAK,MAAM,2BAA2B,IAAI,cAAc,KAAK,IAAI,EAAE;IACpG;;IAGA,SAAM;AACF,kBAAY,OAAO,KAAK,cAAc;AACtC,kBAAY,MAAK;IACrB;;IAGA,eAAuD,oBAA6C;AAChG,YAAM,WAAW,mBAAmB,SAAS;AAC7C,YAAM,WAAW,mBAAmB,SAAS;AAE7C,UAAI,YAAiD;AAErD,WAAM,YAAW,UAAU,KAAK,UAAS,GAAI;AACzC,YAAI,OAAO,kBAAkB,mBAAmB;AAAQ;AAExD,YAAI,QAAQ;AACZ,YAAI,IAAI;AACR,mBAAW,aAAa,OAAO,YAAY;AACvC,gBAAM,yBAAyB,mBAAmB,CAAC;AACnD,cAAI,kCAAkCA,QAAO,OAAO;AAChD,gBAAI,UAAU,KAAK,GAAG,uBAAuB,IAAI,GAAG;AAChD,uBAAS;YACb,WAAW,UAAU,KAAK,MAAM,iBAAiB,sBAAsB,GAAG;AACtE,uBAAS;YACb,OAAO;AACH,uBAAS;YACb;UACJ,WAAW,UAAU,KAAK,QAAQ,wBAAwB;AACtD,qBAAS;UACb,OAAO;AACH,qBAAS;UACb;AACA;QACJ;AAEA,YAAI,QAAQ,UAAU;AAClB;QACJ,WAAW,SAAS,UAAU;AAC1B,iBAAO;QACX,WAAW,aAAa,UAAa,QAAQ,UAAU,CAAC,GAAG;AACvD,sBAAY,CAAC,OAAO,MAAM;QAC9B,WAAW,SAAS,UAAU,CAAC,GAAG;AAgB9B,cAAIS,KAAI;AACR,qBAAW,aAAa,UAAU,CAAC,EAAE,YAAY;AAK7C,gBAAI,UAAU,KAAK,MAAM,iBAAiB,OAAO,WAAWA,EAAC,EAAE,KAAK,KAAK,GAAG;AACxE,0BAAY,CAAC,OAAO,MAAM;AAC1B,uBAAS;YACb;AACA,YAAAA;UACJ;QACJ;MACJ;AAEA,aAAO,YAAY,CAAC;IACxB;;IAGA,aAAa,MAAY;AACrB,aAAO,KAAK,WAAW,KAAK,OAAK,EAAE,QAAQ,IAAI;IACnD;;IAGA,WAAQ;AACJ,aAAO,GACjB,KAAK,WAAW,YAAY,EAAE,GAC9B,KAAK,WAAW,IAAI,IACpB,KAAK,IAAI,GACT,KAAK,SAAS,SAAS,IAAI,IAAI,KAAK,SAAS,IAAI,OAAK,EAAE,KAAK,IAAI,EAAE,KAAK,GAAG,CAAC,MAAM,EAAE,IACnF,KAAK,WAAW,KAAK,IAAI,CAAC,KAC3B,KAAK,eAAe,OAAM,IAAK,KAAK,SAAS,KAAK,uBAAuB,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG,CAAC,EAAE;IAClG;;;;;;;;;IAUA,KAAK,UAA0C;AAC3C,UAAI,KAAK,UAAU;AACf,cAAM,6BAA6B,KAAK,MAAM,KAAK,IAAI,KAAK,KAAK,IAAI,iBAAiB;MAC1F;AAEA,aAAO,IAAI,MAAM,MAAM;QACnB,IAAI,QAA0B,UAAkC,UAA0B;AACtF,kBAAQ,UAAU;YACd,KAAK;AAUD,oBAAM,SACF,oBAAoBT,QAAO,YACrB,OAAO,MAAM,cACT,SAAS,OAAO,IAAI,oCAAmC,IAAKA,QAAO,OAAO,aAAa,CAAC,IACxF,MAAM,wBAAwB,OAAO,MAAM,KAAK,IAAI,KAAK,OAAO,IAAI,8CAA8C,IACtH,OAAO,MAAM,cACX,SAAS,OAAO,IAAI,oCAAmC,IAAK,IAAIA,QAAO,OAAO,UAAU,IACxF,SAAS;AAErB,qBAAO,OAAO,UAAU,KAAK,QAAQ,MAAM;YAC/C,KAAK;AACD,qBAAO,aAAS;AACZ,2BAAW,UAAU,OAAO,QAAQ,EAAC,GAAI;AACrC,sBAAI,CAAC,OAAO,UAAU;AAClB,0BAAM;kBACV;gBACJ;cACJ;YACJ,KAAK;YACL,KAAK;YACL,KAAK;AACD,oBAAM,SAAS,QAAQ,IAAI,QAAQ,QAAQ,EAAE,KAAK,QAAQ;AAC1D,qBAAO,YAAa,MAAW;AAC3B,uBAAO,OAAO,GAAG,IAAI,GAAG,KAAK,QAAQ;cACzC;UACR;AAEA,iBAAO,QAAQ,IAAI,QAAQ,QAAQ;QACvC;OACH;IACL;;IAGA,KAAK,OAA2G;AAC5G,YAAM,sBAAsB,CAAC,KAAK;AAClC,aAAO,IAAI,eACP,IAAI,SAAkE;AAClE,cAAM,aAAa,KAAK,WAClB,KAAK,QACL,KAAK,MAAM,cACT,IAAIA,QAAO,UACN,KAAK,CAAC,EAAoB,IAAI,oCAAmC,IAAKA,QAAO,OAAO,aAAa,CAAC,GACnG,KAAK,MAAM,IAAI,IAEnB,IAAIA,QAAO,OAAO,KAAK,CAAC,CAAkB;AAElD,cAAM,aAAa,KAAK,WAAW,IAAI,CAAC,GAAG,MAAMA,QAAA,eAAe,KAAK,IAAI,mBAAmB,GAAG,EAAE,IAAI,CAAC;AACtG,cAAM,SAAS,MAAM,KAAK,YAAY,GAAG,UAAU;AACnD,eAAOA,QAAA,aAAa,MAAM;MAC9B,GACA,KAAK,WAAW,YAChB,KAAK,cAAc;IAE3B;;;;;;;;;;;;;;;;;;IAmBA,OAAO,mBAAmB,gBAA6B;AACnD,aAAO,KAAK,sBAAsB,cAAc,KAAK,MAAM,2CAA2C,cAAc,EAAE;IAC1H;;;;;;;;;IAUA,OAAO,sBAAsB,gBAA6B;AACtD,UAAI,eAAe,OAAM,GAAI;AACzB,cAAM,uCAAuC;MACjD;AAEA,YAAM,gBAAgB,aAAS;AAC3B,eAAO,mCAAmC,OAAM;AAEhD,eAAO,QAAQ,gBAAgB,KAAK,EAAE,OAAO,OAAK,EAAE,QAAQ,MAAS;MACzE;AAEA,iBAAW,SAAS,cAAa,GAAI;AACjC,YAAI;AACJ,YAAI;AAEA,oBAAU,OAAO,SAAS,MAAM,MAAM,MAAM,MAAM,eAAe,eAAc,CAAE;QACrF,SAAS,GAAG;AACR;QACJ;AAgBA,mBAAW,EAAE,QAAO,KAAM,SAAS;AAC/B,gBAAM,SAAS,IAAIA,QAAO,OAAO,QAAQ,IAAI,qBAAoB,CAAE,CAAC;AAEpE,cAAI;AAEA,gBAAI,OAAO,QAAQ,MAAM;AACrB;YACJ;UACJ,SAAS,GAAG;AACR;UACJ;AAGA,gBAAM,eAAe,mCAAmC,IAAI,MAAM,KAAK,QAAO,CAAE;AAChF,cAAI,gBAAgB,UAAa,aAAa,QAAQ,MAAM,MAAM;AAC9D,+CAAmC,IAAI,MAAM,KAAK,QAAO,GAAI,KAAK;UACtE;AAEA,iBAAO;QACX;MACJ;IACJ;;;;;;;;IASA,OAAO,2BAA2B,wBAAuC;AACrE,aACI,KAAK,8BAA8B,sBAAsB,KAAK,MAAM,mCAAmC,uBAAuB,SAAS,EAAE,CAAC,EAAE;IAEpJ;;;;;;;;IASA,OAAO,8BAA8B,wBAAuC;AACxE,aAAO,KAAK,sBAAsBA,QAAO,OAAO,KAAK,IAAI,IAAI,sBAAsB,CAAC,CAAC;IACzF;;;;;;;;;;;;;;IAeA,OAAO,eAAe,SAAsB;AACxC,aAAO,KAAK,kBAAkB,OAAO,KAAK,MAAM,2CAA2C,OAAO,EAAE;IACxG;;;;;;;;;IAUA,OAAO,kBAAkB,SAAsB;AAC3C,YAAM,QAAQ,QAAQ,kBAAkB,OAAO;AAC/C,aAAO,SAAS,OAAO,SAAY,KAAK,sBAAsB,MAAM,IAAI;IAC5E;;AAxkBA,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAUD,aAAA;IADC;;AAqBD,aAAA;IADC;;AAYD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAoBD,aAAA;IADC;;AAOD,aAAA;IADC;;AAYD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAWD,aAAA;IADC;;AAOD,aAAA;IADC;;AApJQ,EAAAA,QAAA,SAAM;AA8mBnB,MAAI,oCAAoC,MAAc;AAClD,UAAM,eAAeA,QAAO,OAAO,MAAM,eAAe;AAExD,UAAM,SAAS,IAAI,eAAe,aAAa,OAAO,UAAU,CAAC,EAAE,gBAAgB,QAAQ,CAAC,WAAW,SAAS,CAAC;AACjH,UAAM,WAAW,aAAa,IAAG;AAIjC,UAAM,WAAW,OAAO,UAAU,QAAQ;AAE1C,UAAM,SAAS,CAAC;AAChB,YAAQ,oCAAoC,MAAM,QAAO;EAC7D;AAEA,MAAI,sCAAsC,MAAc;AACpD,UAAM,SAASA,QAAO,OAAO,MAAM,cAAc,EAAE,MAAK;AACxD,WAAO,MAAM,SAAS,EAAE,QAAQ;AAMhC,UAAM,SAAS,OAAO,OAAgB,UAAU,CAAC,EAAE,SAAS,OAAO,KAAK,EAAE,UAAU,QAAQ,UAAU;AACtG,YAAQ,sCAAsC,MAAM,QAAO;EAC/D;AAEA,MAAI,uBAAuB,MAAa;AACpC,UAAM,iBAAiBA,QAAO,OAAO,MAAM,0BAA0B,EAAE,WAAU,EAAG,MAAqB,gBAAgB,EAAE;AAC3H,UAAM,8BAA8B,eAAe,MAAqB,YAAY,EAAE;AACtF,UAAM,uBAAuB,eAAe,MAAqB,QAAQ,EAAE;AAE3E,UAAM,SACF,qBAAqB,SAAS,OAAK,EAAE,YAAW,EAAG,OAAO,2BAA2B,CAAC,KACtF,MAAM,sEAAsE;AAChF,YAAQ,uBAAuB,MAAM,QAAO;EAChD;AAEA,QAAM,qCAAqC,oBAAI,IAAG;AAoDtD,GAxsBUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAaU,gBAAe,aAAY;;IAGpC,WAAW,aAAU;AACjB,aAAOV,QAAO,OAAO,MAAM,eAAe,EAAE;IAChD;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;IAkCA,IAAI,OAAI;AACJ,UAAI,KAAK,MAAM,UAAU,MAAM;AAC3B,cAAM,SAAS,KAAK,MAAM,KAAK,IAAI,gBAAgB;MACvD;AAEA,aAAO,IAAI,MAAM,MAAM;QACnB,IAAI,QAAuB,UAA+B,UAAuB;AAC7E,cAAI,YAAY,SAAS;AACrB,mBAAO,QAAQ,IAAI,QAAQ,QAAQ,EAAE;UACzC,WAAW,YAAY,QAAQ;AAC3B,mBAAO,QAAQ,yBAAyBA,QAAO,OAAO,WAAW,QAAQ,EAAG,IAAK,KAAK,QAAQ,EAAC;UACnG;AACA,iBAAO,QAAQ,IAAI,QAAQ,QAAQ;QACvC;OACH;IACL;;IAIA,IAAI,QAAK;AACL,aAAO,IAAIA,QAAO,MAAMA,QAAO,QAAQ,eAAe,IAAI,CAAC;IAC/D;;IAGA,IAAI,UAAO;AACP,aAAO,IAAIA,QAAO,OAAO,QAAQ,IAAI;IACzC;;IAIA,IAAI,OAAI;AACJ,aAAOA,QAAO,QAAQ,cAAc,IAAI;IAC5C;;IAGA,MAAmC,MAAY;AAC3C,aAAO,KAAK,SAAS,IAAI,KAAK,MAAM,kCAAkC,IAAI,0BAA0B,KAAK,MAAM,KAAK,IAAI,EAAE;IAC9H;;IAGA,OAA2C,MAAc,iBAAyB,IAAE;AAChF,aAAO,KAAK,UAAa,MAAM,cAAc,KAAK,MAAM,mCAAmC,IAAI,0BAA0B,KAAK,MAAM,KAAK,IAAI,EAAE;IACnJ;;IAGA,IAAI,KAAY;AACZ,aAAO,IAAIA,QAAO,SAASA,QAAO,QAAQ,YAAY,MAAM,CAAC,GAAG,CAAC;IACrE;;IAGA,cAAkD,QAAqB;AACnE,aAAO,IAAIA,QAAO,OAAUA,QAAO,QAAQ,uBAAuB,MAAM,MAAM,CAAC,EAAE,KAAK,IAAI;IAC9F;;IAGA,SAAsC,MAAY;AAC9C,YAAM,QAAQ,KAAK,MAAM,SAAY,IAAI;AAEzC,UAAI,OAAO,UAAU;AAGjB,mBAAW,SAAS,KAAK,MAAM,UAAU,EAAE,gBAAgB,MAAK,CAAE,GAAG;AACjE,qBAAWW,UAAS,MAAM,QAAQ;AAC9B,gBAAIA,OAAM,QAAQ,QAAQ,CAACA,OAAM,UAAU;AACvC,qBAAOA,OAAM,KAAK,IAAI;YAC1B;UACJ;QACJ;AACA,eAAO;MACX;AAEA,aAAO,OAAO,KAAK,IAAI;IAC3B;;IAGA,UAA8C,MAAc,iBAAyB,IAAE;AACnF,YAAM,SAAS,KAAK,MAAM,UAAa,MAAM,cAAc;AAE3D,UAAI,QAAQ,UAAU;AAClB,mBAAW,SAAS,KAAK,MAAM,UAAS,GAAI;AACxC,qBAAWP,WAAU,MAAM,SAAS;AAChC,gBAAIA,QAAO,QAAQ,QAAQ,CAACA,QAAO,aAAa,iBAAiB,KAAKA,QAAO,kBAAkB,iBAAiB;AAC5G,qBAAOA,QAAO,KAAK,IAAI;YAC3B;UACJ;QACJ;AACA,eAAO;MACX;AAEA,aAAO,QAAQ,KAAK,IAAI;IAC5B;;IAGA,WAAQ;AACJ,aAAO,KAAK,OAAM,IAAK,SAAS,KAAK,OAAsB,YAAY,CAAC,EAAE,OAAM,EAAG,WAAW;IAClG;;IAGA,QAAK;AACD,aAAO,KAAK,MAAM,cACZ,IAAIJ,QAAO,UAAUA,QAAO,QAAQ,YAAY,IAAI,GAAG,KAAK,MAAM,IAAI,IACtE,MAAM,+BAA+B,KAAK,MAAM,KAAK,IAAI,8BAA8B;IACjG;;IAGA,QAAQ,mBAA0B;AAC9B,aAAO,IAAIA,QAAO,SAASA,QAAO,QAAQ,mBAAmB,MAAM,CAAC,iBAAiB,CAAC;IAC1F;;AAxFA,aAAA;IADC;;AAYD,aAAA;IADC;;AAjEM,aAAA;IADN;;AAFQ,EAAAA,QAAA,SAAMU;AAqJnB,GAAA,SAAiBA,SAAM;IACnB,MAAa,QAAO;MAEsB;;MAAtC,YAAsC,QAA0B;AAA1B,aAAA,SAAA;MAA6B;;MAGnE,QAAK;AACD,eAAOV,QAAO,QAAQ,aAAa,KAAK,MAAM;MAClD;;MAGA,OAAI;AACA,eAAOA,QAAO,QAAQ,YAAY,KAAK,MAAM;MACjD;;MAGA,QAAK;AACD,eAAOA,QAAO,QAAQ,aAAa,KAAK,MAAM;MAClD;;MAGA,WAAQ;AACJ,eAAOA,QAAO,QAAQ,gBAAgB,KAAK,MAAM;MACrD;;MAGA,SAAS,SAAe;AACpB,eAAO,CAAC,CAACA,QAAO,QAAQ,gBAAgB,KAAK,QAAQ,OAAO;MAChE;;MAGA,QAAQ,SAAe;AACnB,eAAO,CAAC,CAACA,QAAO,QAAQ,eAAe,KAAK,QAAQ,OAAO;MAC/D;;MAGA,OAAI;AACA,eAAOA,QAAO,QAAQ,YAAY,KAAK,MAAM;MACjD;;AArCS,IAAAU,QAAA,UAAO;EAuCxB,GAxCiBA,UAAAV,QAAA,WAAAA,QAAA,SAAM,CAAA,EAAA;AAyC3B,GA/LUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,UAAS;;IAET;;IAGA;;IAGA;IAET,YAAY,MAAc,UAAkB,MAAiB;AACzD,WAAK,OAAO;AACZ,WAAK,WAAW;AAChB,WAAK,OAAO;IAChB;;IAGA,WAAQ;AACJ,aAAO,GAAG,KAAK,KAAK,IAAI,IAAI,KAAK,IAAI;IACzC;;AAnBS,EAAAA,QAAA,YAAS;AAyB1B,GA1BUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,gBAAiE,aAAY;IAC1C;IAA5C,YAAY,QAAgC,MAAiB;AACzD,YAAM,MAAM;AAD4B,WAAA,OAAA;IAE5C;;IAGA,IAAI,OAAa;AACb,aAAOA,QAAA,KAAK,KAAK,OAAO,IAAI,QAAQ,KAAK,KAAK,MAAM,gBAAgB,GAAG,KAAK,IAAI;IACpF;;IAGA,KAAK,QAAgB,SAAiB,GAAC;AACnC,YAAM,SAAS,IAAI,WAAW,MAAS,MAAM;AAE7C,eAAS,IAAI,GAAG,IAAI,QAAQ,KAAK;AAC7B,eAAO,CAAC,IAAI,KAAK,IAAI,IAAI,MAAM;MACnC;AAEA,aAAO;IACX;;IAGA,IAAI,OAAe,OAAQ;AACvB,MAAAA,QAAA,MAAM,KAAK,OAAO,IAAI,QAAQ,KAAK,KAAK,MAAM,gBAAgB,GAAG,OAAO,KAAK,IAAI;IACrF;;IAGA,WAAQ;AACJ,aAAO,KAAK,OAAO,SAAQ;IAC/B;;IAGA,MAAM,QAAa,SAAiB,GAAC;AACjC,eAAS,IAAI,GAAG,IAAI,OAAO,QAAQ,KAAK;AACpC,aAAK,IAAI,IAAI,QAAQ,OAAO,CAAC,CAAC;MAClC;IACJ;;AApCS,EAAAA,QAAA,UAAO;AAsCxB,GAvCUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,kBAAmE,aAAY;IAC5C;IAA5C,YAAY,QAAgC,MAAiB;AACzD,YAAM,MAAM;AAD4B,WAAA,OAAA;IAE5C;;IAGA,IAAI,QAAK;AACL,aAAOA,QAAA,KAAK,KAAK,QAAQ,KAAK,IAAI;IACtC;;IAGA,IAAI,MAAM,OAAQ;AACd,MAAAA,QAAA,MAAM,KAAK,QAAQ,OAAO,KAAK,IAAI;IACvC;;IAGA,WAAQ;AACJ,aAAO,KAAK,OAAM,IAAK,SAAS,KAAK,KAAK,KAAK;IACnD;;AAlBS,EAAAA,QAAA,YAAS;AA0BtB,WAAgB,UAAuC,OAAU,MAAkB;AAC/E,UAAM,SAAS,OAAO,MAAM,QAAQ,WAAW;AAE/C,YAAQ,OAAO,OAAO;MAClB,KAAK;AACD,eAAO,IAAIA,QAAO,UAAU,OAAO,QAAQ,CAAC,KAAK,GAAGA,QAAO,OAAO,MAAM,gBAAgB,EAAE,IAAI;MAClG,KAAK;AACD,gBAAQ,MAAM,WAAW;UACrB,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,QAAQ,KAAK,GAAG,IAAI;UAC9D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,QAAQ,KAAK,GAAG,IAAI;UAC9D,KAAKA,QAAO,KAAK,KAAK;UACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAG,IAAI;UAC/D,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,WAAW,KAAK,GAAG,IAAI;UACjE,KAAKA,QAAO,KAAK,KAAK;AAClB,mBAAO,IAAIA,QAAO,UAAa,OAAO,YAAY,KAAK,GAAG,IAAI;QACtE;MACJ,KAAK;AACD,YAAI,iBAAiBA,QAAO,aAAa,iBAAiBA,QAAO,SAAS;AACtE,iBAAO,IAAIA,QAAO,UAAa,MAAM,QAAQ,MAAM,IAAI;QAC3D,WAAW,iBAAiBA,QAAO,QAAQ;AACvC,iBAAO,IAAIA,QAAO,UAAa,OAAO,aAAa,KAAK,GAAG,MAAM,MAAM,IAAI;QAC/E,WAAW,iBAAiBA,QAAO,UAAU,iBAAiBA,QAAO,OAAO;AACxE,iBAAO,IAAIA,QAAO,UAAa,OAAO,aAAa,KAAK,GAAG,MAAM,OAAO,MAAM,IAAI;QACtF,WAAW,iBAAiB,eAAe;AACvC,kBAAQ,MAAM,WAAW;YACrB,KAAKA,QAAO,KAAK,KAAK;YACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,qBAAO,IAAIA,QAAO,UAAa,OAAO,aAAa,KAAK,GAAG,IAAI;UACvE;QACJ,WAAW,iBAAiB,OAAO;AAC/B,iBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAGA,QAAO,OAAO,MAAM,cAAc,EAAE,IAAI;QACnG,WAAW,iBAAiB,QAAQ;AAChC,iBAAO,IAAIA,QAAO,UAAa,OAAO,SAAS,KAAK,GAAGA,QAAO,OAAO,MAAM,eAAe,EAAE,IAAI;QACpG;MACJ;AACI,cAAM,kCAAkC,KAAK,4BAA4B,MAAM,IAAI,EAAE;IAC7F;EACJ;AAnDgB,EAAAA,QAAA,YAAS;AAoD7B,GA/EUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAaY,gBAAe,aAAY;;IAEpC,IAAI,UAAO;AACP,aAAOZ,QAAO,QAAQ,eAAe,IAAI,EAAE,gBAAgB,KAAK,MAAM;IAC1E;;IAGA,IAAI,QAAQ,OAAoB;AAE5B,YAAM,SAASA,QAAO,OAAO,WAAW,EAAE,OAAO,SAAS,OAAK,EAAE,QAAO,KAAM,CAAC,KACxE,MAAM,6DAA6D;AAE1E,iBAAW,OAAO,eAAeA,QAAO,OAAO,WAAW,WAAW;QACjE,IAAyBa,QAAoB;AACzC,UAAAb,QAAO,QAAQ,eAAe,IAAI,EAAE,iBAAiBa,UAAS,EAAE;AAChE,eAAK,OAAO,IAAI,MAAM,EAAE,SAASA,QAAO,UAAU,CAAC;QACvD;OACH;AAED,WAAK,UAAU;IACnB;;IAGA,IAAI,SAAM;AACN,aAAOb,QAAO,QAAQ,gBAAgB,IAAI;IAC9C;;IAGA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAO,IAAI;IACjC;;IAGA,WAAQ;AACJ,aAAO,KAAK,OAAM,IAAK,SAAS,IAAI,KAAK,OAAO;IACpD;;AAnCS,EAAAA,QAAA,SAAMY;AAuCnB,WAAgB,OAAO,SAAsB;AACzC,WAAO,IAAIZ,QAAO,OAAOA,QAAO,QAAQ,UAAU,OAAO,gBAAgB,WAAW,EAAE,CAAC,CAAC;EAC5F;AAFgB,EAAAA,QAAA,SAAM;AAG1B,GA3CUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,eAAe,aAAY;;;;;;;;;;;;IAYpC,OAAO,OAAO,UAAgB;AAC1B,aAAO,QAAQ,YAAY,UAAU,MAAMA,QAAO,aAAa;IACnE;;;;;IAMA,IAAI,KAAE;AACF,UAAI,MAAM,WAAA;AACN,eAAO,KAAK,SAAS,MAAc,WAAW,EAAE,MAAM,SAAQ;MAClE;AAIA,UAAI,QAAQ,YAAY,WAAW;AAC/B,cAAM,kBAAkB,QAAQ,mBAAkB;AAClD,cAAM,qBAAqB,IAAI,IAAI,MAAMA,QAAO,aAAc,CAAC;AAE/D,cAAM,SACF,mBAAmB,SAAS,OAAK,EAAE,QAAO,KAAM,iBAAiB,IAAI,KACrE,MAAM,0EAA0E;AAEpF,cAAM,uBAAuB;AAC7B,cAAM,WAAA;AACF,gBAAM,SAAS,IAAI,qBAAqB,MAAM,IAAI,CAAC;AAEnD,cAAI,OAAO,OAAM,GAAI;AACjB,iBAAK,+BAA+B,KAAK,MAAM,gDAAgD;AAC/F,mBAAO;UACX;AACA,iBAAO,OAAO,IAAI,MAAM,EAAE,QAAO;QACrC;MACJ;AAEA,aAAOA,QAAO,OAAO,WAAW,MAAM,KAAK,IAAI;AAE/C,aAAO,KAAK;IAChB;;;;;IAOA,IAAI,WAAQ;AACR,aACI,KAAK,OAAO,SAAwB,iBAAiB,GAAG;MAExD,KAAK;IAEb;;IAIA,IAAI,cAAW;AACX,aAAO,CAACA,QAAO,QAAQ,WAAW,IAAI;IAC1C;;IAIA,IAAI,YAAS;AACT,aAAO,KAAK,OAAO,OAAe,qBAAqB,EAAE,OAAM;IACnE;;IAIA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAO,IAAI;IACjC;;IAIA,IAAY,aAAU;AAClB,aAAO,KAAK,SAAS,MAAqB,aAAa,EAAE;IAC7D;;IAIA,IAAY,yBAAsB;AAC9B,YAAM,uBAAuB,KAAK,OAAO,UAAyB,4BAA4B,KAAK,KAAK,OAAO,OAAO,sBAAsB;AAC5I,YAAM,mBAAmB,qBAAqB,OAAM;AAOpD,YAAM,yBACF,iBAAiB,SAAwB,cAAc,GAAG,SAC1D,iBAAiB,UAAyB,4BAA4B,GAAG,OAAM,KAC/E,KAAK,cAAcA,QAAO,OAAO,MAAM,yCAAyC,CAAC;AAErF,aAAO,wBAAwB,WAAU,KAAM;IACnD;;IAGA,SAAM;AACF,aAAOA,QAAO,QAAQ,aAAa,IAAI;IAC3C;;IAGA,SAAY,OAAc;AACtB,YAAM,OAAO,KAAK,wBAAwB,UAAU,MAAM;AAE1D,UAAI,QAAQ,MAAM;AACd,eAAO,QAAQ,YAAY,KAAK,IAAI,KAAK;MAC7C;AAEA,aAAO,IAAI,QAAQ,aAAU;AACzB,cAAM,WAAWA,QAAO,SAASA,QAAO,OAAO,MAAM,qCAAqC,GAAG,MAAK;AAC9F,gBAAM,SAAS,MAAK;AACpB,uBAAa,MAAM,QAAQ,MAAM,CAAC;QACtC,CAAC;AAgBD,eAAO,SAAS,YAAY,MAAK;AAC7B,mBAAS,MAAM,YAAY,EAAE,QAAQ,SAAS,MAAM,aAAa,EAAE,QAAQA,QAAO,QAAQ;QAC9F,CAAC;AAED,aAAK,OAAO,UAAU,IAAI;MAC9B,CAAC;IACL;;IAGA,cAAc,OAAmB;AAC7B,eAAS,IAAI,GAAG,IAAI,IAAI,KAAK;AACzB,cAAM,OAAO,KAAK,WAAW,IAAI,IAAI,QAAQ,WAAW,EAAE,YAAW;AACrE,YAAI,CAAC,KAAK,OAAM,GAAI;AAChB,gBAAM,SAAS,IAAIA,QAAO,OAAO,KAAK,YAAW,CAAE,EAAE,WAAU;AAC/D,cAAI,QAAQ,OAAO,aAAa,OAAO,KAAK,GAAG;AAC3C,mBAAO;UACX;QACJ;MACJ;IACJ;;AAvGA,aAAA;IADC;;AAWD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AAOD,aAAA;IADC;;AA1FQ,EAAAA,QAAA,SAAM;AAqKnB,SAAOA,SAAQ,mBAAmB,MAAK;AACnC,QAAIA,QAAO,QAAQ,yBAAyB,OAAM,GAAI;AAKlD,YAAM,gBAAgBA,QAAO,iBAAiB,MAAM,0CAA0C;AAC9F,YAAM,UAAU,cAAc,OAAO,eAAc;AAGnD,YAAM,gBAAgB,aAAS;AAE3B,YAAI;AACA,iBAAOA,QAAO,GAAG;QACrB,SAAS,GAAG;QAAC;AAGb,cAAM,QAAQ,kBAAkBA,QAAO,OAAO,SAAS,MAAM;AAC7D,cAAM,QAAQ,kBAAkBA,QAAO,OAAO,MAAM,yBAAyB,EAAE,gBAAgB;AAG/F,eAAO,QAAQ,gBAAgB,KAAK,EAAE,OAAO,OAAK,EAAE,QAAQ,MAAS;MACzE;AAEA,iBAAW,SAAS,cAAa,GAAI;AACjC,YAAI,UAA6B,CAAA;AACjC,YAAI;AAEA,oBAAU,OAAO,SAAS,MAAM,MAAM,MAAM,MAAM,OAAO;QAC7D,SAAS,GAAG;QAAC;AAEb,YAAI,QAAQ,UAAU,GAAG;AACrB,gBAAM,UAA2B,CAAA;AACjC,gBAAM,OAAO,CAAC,UAAiB;AAC3B,kBAAM,SAAS,QAAQ,CAAC,EAAE,QAAQ,IAAI,QAAQ,QAAQ,WAAW,EAAE,YAAW;AAG9E,gBAAI,CAAC,OAAO,OAAM,KAAM,QAAQ,mBAAmB,MAAM,KAAK,MAAM;AAGhE,oBAAM,SAAS,IAAIA,QAAO,OAAO,MAAM;AACvC,kBAAI,OAAO,OAAO,MAAM,OAAO,cAAc,OAAO,KAAK,GAAG;AACxD,uBAAO,QAAQ,KAAK,MAAM;cAC9B;YACJ;UACJ;AAEA,mBAAS,IAAI,GAAG,KAAK,CAAC,GAAG;AAAI;AAC7B,kBAAQ,QAAO;AACf,mBAAS,IAAI,GAAG,KAAK,CAAC,GAAG;AAAI;AAE7B,iBAAO;QACX;MACJ;AAEA,YAAM,mCAAmC;IAC7C;AAEA,WAAO,eAAeA,QAAO,QAAQ,wBAAwB,EAAE,IAAI,OAAK,IAAIA,QAAO,OAAO,CAAC,CAAC;EAChG,CAAC;AAID,SAAOA,SAAQ,iBAAiB,MAAK;AACjC,WAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,iBAAgB,CAAE,EAAE,WAAU;EAC1E,CAAC;AAID,SAAOA,SAAQ,cAAc,MAAK;AAM9B,WAAOA,QAAA,gBAAgB,CAAC;EAC5B,CAAC;AACL,GAnPUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;AAEZ,MAAa,OAAb,MAAa,aAAa,aAAY;;IAGlC,WAAW,OAAI;AACX,YAAM,IAAI,CAACC,IAAW,QAAQ,CAACA,OAA2CA,OAAM,MAAMD,QAAO,OAAO,MAAMC,EAAC,CAAC,EAAE,KAAK;AAEnH,YAAM,UAAU;QACZ,MAAM,EAAE,aAAa;QACrB,SAAS,EAAE,gBAAgB;QAC3B,MAAM,EAAE,aAAa;QACrB,MAAM,EAAE,cAAc;QACtB,OAAO,EAAE,aAAa;QACtB,OAAO,EAAE,cAAc;QACvB,QAAQ,EAAE,eAAe;QACzB,KAAK,EAAE,cAAc;QACrB,MAAM,EAAE,eAAe;QACvB,MAAM,EAAE,cAAc;QACtB,OAAO,EAAE,eAAe;QACxB,MAAM,EAAE,eAAe;QACvB,OAAO,EAAE,gBAAgB;QACzB,OAAO,EAAE,eAAe;QACxB,QAAQ,EAAE,eAAe;QACzB,SAAS,EAAE,iBAAiB,CAAAA,OAAKA,GAAE,MAAM,SAAS,CAAC;QACnD,YAAY,EAAE,gBAAgB;QAC9B,QAAQ,EAAE,eAAe;QACzB,QAAQ,EAAE,eAAe;QACzB,OAAO,EAAE,cAAc;QACvB,OAAO,EAAE,eAAe,CAAAA,OAAKA,GAAE,UAAU;QACzC,QAAQ,EAAE,eAAe,CAAAA,OAAK,IAAID,QAAO,MAAMA,QAAO,QAAQ,mBAAmBC,IAAG,CAAC,CAAC,CAAC;QACvF,kBAAkB,EAAE,gBAAgB,CAAAA,OAAKA,GAAE,WAAW,KAAK,CAAAA,OAAKA,GAAE,KAAK,SAAS,IAAI,CAAC,CAAE;;AAK3F,cAAQ,eAAe,MAAM,QAAQ,EAAE,OAAO,QAAO,CAAE;AAEvD,aAAO,kBAAkB;QACrB,GAAG;QACH,KAAK,EAAE,mBAAmB,CAAAA,OAAKA,GAAE,SAAS,CAAC,CAAC;QAC5C,MAAM,EAAE,gBAAgB,CAAAA,OAAKA,GAAE,OAAO,cAAc,CAAC,EAAE,SAAS,CAAC,CAAC;OACrE;IACL;;IAIA,IAAI,QAAK;AACL,aAAO,IAAID,QAAO,MAAMA,QAAO,QAAQ,aAAa,IAAI,CAAC;IAC7D;;IAIA,IAAI,aAAU;AACV,eAAS,mBAAmB,MAAiB;AACzC,cAAM,iBAAiB,KAAK,MAAM,OAAO,OAAO,OAAK,CAAC,EAAE,QAAQ;AAChE,eAAO,eAAe,UAAU,IAAI,CAAC,MAAM,IAAI,eAAe,IAAI,OAAK,EAAE,KAAK,UAAU;MAC5F;AAEA,UAAI,KAAK,eAAe;AACpB,eAAO;MACX;AAEA,cAAQ,KAAK,WAAW;QACpB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,KAAK,MAAM,SAAS,KAAK,MAAM,SAAU,aAAa,mBAAmB,IAAI;QACxF,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO,KAAK,MAAM,WAAW,mBAAmB,IAAI,IAAI,KAAK,MAAM,SAAS,KAAK,MAAM,SAAU,aAAa;QAClH;AACI,iBAAO;MACf;IACJ;;IAIA,IAAI,gBAAa;AACb,aAAO,KAAK,KAAK,SAAS,GAAG;IACjC;;IAIA,IAAI,cAAW;AACX,cAAQ,KAAK,WAAW;QACpB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;QACtB,KAAKA,QAAO,KAAK,KAAK;AAClB,iBAAO;QACX;AACI,iBAAO;MACf;IACJ;;IAIA,IAAI,OAAI;AACJ,YAAM,SAASA,QAAO,QAAQ,YAAY,IAAI;AAE9C,UAAI;AACA,eAAO,OAAO,eAAc;MAChC;AACI,QAAAA,QAAO,KAAK,MAAM;MACtB;IACJ;;IAIA,IAAI,SAAM;AACN,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,cAAc,IAAI,CAAC;IAC/D;;IAIA,IAAI,YAAS;AACT,aAAOA,QAAO,QAAQ,gBAAgB,IAAI;IAC9C;IAEA,GAAG,OAAkB;AACjB,UAAIA,QAAO,QAAQ,WAAW,OAAM,GAAI;AACpC,eAAO,KAAK,OAAO,OAAgB,QAAQ,EAAE,OAAO,MAAM,MAAM;MACpE;AAEA,aAAO,CAAC,CAACA,QAAO,QAAQ,WAAW,MAAM,KAAK;IAClD;;IAGA,WAAQ;AACJ,aAAO,KAAK;IAChB;;AA9HA,aAAA;IADC;;AAOD,aAAA;IADC;;AA0DD,aAAA;IADC;;AAOD,aAAA;IADC;;AAyBD,aAAA;IADC;;AAaD,aAAA;IADC;;AAOD,aAAA;IADC;;AAxJM,aAAA;IADN;;AAFQ,SAAI,WAAA;IADhB;KACY,IAAI;AAAJ,EAAAA,QAAA,OAAI;AA6KrB,GA/KUA,YAAAA,UAAM,CAAA,EAAA;ACAhB,IAAUA;CAAV,SAAUA,SAAM;EACZ,MAAa,kBAAkB,aAAY;IACK;IAA5C,YAAY,QAAgC,MAAiB;AACzD,YAAM,MAAM;AAD4B,WAAA,OAAA;IAE5C;;IAGA,MAAG;AACC,aAAO,IAAIA,QAAO,OAAOA,QAAO,QAAQ,aAAa,KAAK,KAAK,OAAO,IAAI,CAAC;IAC/E;;IAGA,MAAmC,MAAY;AAC3C,aAAO,KAAK,SAAS,IAAI,KAAK,MAAM,kCAAkC,IAAI,0BAA0B,KAAK,KAAK,IAAI,EAAE;IACxH;;IAGA,OAA2C,MAAc,iBAAyB,IAAE;AAChF,aAAO,KAAK,UAAa,MAAM,cAAc,KAAK,MAAM,mCAAmC,IAAI,0BAA0B,KAAK,KAAK,IAAI,EAAE;IAC7I;;IAGA,SAAsC,MAAY;AAC9C,YAAM,QAAQ,KAAK,KAAK,MAAM,SAAY,IAAI;AAE9C,UAAI,OAAO,UAAU;AACjB,mBAAW,SAAS,KAAK,KAAK,MAAM,UAAS,GAAI;AAC7C,qBAAWW,UAAS,MAAM,QAAQ;AAC9B,gBAAIA,OAAM,QAAQ,QAAQ,CAACA,OAAM,UAAU;AACvC,qBAAOA,OAAM,KAAK,IAAI;YAC1B;UACJ;QACJ;AACA,eAAO;MACX;AAEA,aAAO,OAAO,KAAK,IAAI;IAC3B;;IAGA,UAA8C,MAAc,iBAAyB,IAAE;AACnF,YAAM,SAAS,KAAK,KAAK,MAAM,UAAa,MAAM,cAAc;AAEhE,UAAI,QAAQ,UAAU;AAClB,mBAAW,SAAS,KAAK,KAAK,MAAM,UAAS,GAAI;AAC7C,qBAAWP,WAAU,MAAM,SAAS;AAChC,gBAAIA,QAAO,QAAQ,QAAQ,CAACA,QAAO,aAAa,iBAAiB,KAAKA,QAAO,kBAAkB,iBAAiB;AAC5G,qBAAOA,QAAO,KAAK,IAAI;YAC3B;UACJ;QACJ;AACA,eAAO;MACX;AAEA,aAAO,QAAQ,KAAK,IAAI;IAC5B;;IAGA,WAAQ;AACJ,YAAM,WAAW,KAAK,OAAsB,YAAY,CAAC;AACzD,aAAO,KAAK,OAAM,IACZ;;;QAGF,SAAS,MAAM,cACb,SAAS,OAAM,EAAG,WAAW,SAC7B,KAAK,IAAG,EAAG,SAAQ,KAAM;;IACnC;;AAlES,EAAAJ,QAAA,YAAS;AAoE1B,GArEUA,YAAAA,UAAM,CAAA,EAAA;AC6ChB,WAAW,SAASA;;;ACnCpB,IAAM,eAAe;AACrB,IAAM,aAAa;AACnB,IAAM,iBAAiB;AAEvB,IAAM,iBAAiB;AACvB,IAAM,iBAAiB;AACvB,IAAM,gBAAgB;AACtB,IAAM,aAAa;AACnB,IAAM,MAAM;AACZ,IAAM,iBAAiB,MAAM,OAAO;AAEpC,IAAI,kBAAyF;AAC7F,IAAI;AACF,oBAAkB,IAAI;AAAA,IACnB,QAAgB,gBAAgB,WAAW,EAAE,gBAAgB,qBAAqB;AAAA,IACnF;AAAA,IAAO,CAAC,OAAO,WAAW,SAAS;AAAA,EAAC;AACxC,SAAS,GAAG;AAAE,UAAQ,IAAI,GAAG,GAAG,eAAe,CAAC,EAAE;AAAG;AACrD,IAAM,SAAS,OAAO,gBAAgB,WAAW;AACjD,IAAM,MAAM,CAAC,GAAW,OAAO,MAAM;AACnC,UAAQ,IAAI,GAAG,GAAG,IAAI,CAAC,EAAE;AACzB,MAAI;AAAE,sBAAkB,MAAM,QAAQ,OAAO,gBAAgB,EAAE,SAAS,MAAM,EAAE,MAAM,GAAG,GAAG,IAAI,QAAQ,CAAC,CAAC;AAAA,EAAG,SAAS,GAAG;AAAA,EAAC;AAC5H;AAEA,IAAM,cAAc;AACpB,IAAM,gBAAgB;AACtB,IAAM,cAAc,CAAC,MAAsB,EAAE,QAAQ,aAAa,QAAQ,EAAE,QAAQ,eAAe,OAAO;AAC1G,IAAM,MAAM;AACZ,SAAS,WAAW,MAAM,IAAY;AACpC,QAAM,IAAc,CAAC;AACrB,WAAS,IAAI,GAAG,IAAI,KAAK,IAAK,GAAE,KAAK,KAAK,MAAM,KAAK,OAAO,IAAI,GAAG,CAAC;AACpE,MAAI,IAAI;AACR,WAAS,IAAI,GAAG,IAAI,EAAE,QAAQ,KAAK,GAAG;AACpC,UAAM,IAAK,EAAE,CAAC,KAAK,MAAQ,EAAE,IAAI,CAAC,KAAK,MAAM,KAAM,EAAE,IAAI,CAAC,KAAK;AAC/D,SAAK,IAAK,KAAK,KAAM,EAAE,IAAI,IAAK,KAAK,KAAM,EAAE;AAC7C,SAAK,IAAI,IAAI,EAAE,SAAS,IAAK,KAAK,IAAK,EAAE,IAAI;AAC7C,SAAK,IAAI,IAAI,EAAE,SAAS,IAAI,IAAI,EAAE,IAAI;AAAA,EACxC;AACA,SAAO;AACT;AAGA,SAAS,QAAQ,GAAgB;AAC/B,MAAI,KAAK,KAAM,QAAO;AACtB,MAAI,OAAO,MAAM,SAAU,QAAO;AAClC,MAAI;AAAE,WAAO,OAAQ,EAAU,MAAM,SAAS,EAAE,KAAK;AAAA,EAAG,SAAS,GAAG;AAAE,WAAO;AAAA,EAAI;AACnF;AAGA,SAAS,kBAAkB,KAAoB,OAAe;AAC5D,MAAI,OAAO,OAAO,IAAI,MAAM,EAAE,OAAO,QAAQ,EAAE,OAAO,KAAK;AAC7D;AAEA,SAAS,OAAO,OAAqB,OAAe,OAA6B;AAC/E,QAAM,IAAI,MAAM,QAAQ,KAAK,OAAK,EAAE,SAAS,SAAS,EAAE,gBAAgB,SAAS,KAAK;AACtF,MAAI,CAAC,EAAG,OAAM,IAAI,MAAM,SAAS,KAAK,IAAI,KAAK,YAAY;AAC3D,SAAO;AACT;AAEA,SAAS,YAAY,UAAwC;AAC3D,MAAI;AACF,QAAI,YAAY,CAAC,SAAS,OAAO,OAAO,GAAG;AACzC,YAAM,QAAQ,SAAS,MAAmC,eAAe,EAAE;AAC3E,YAAM,MAAM,QAAQ,SAAS,MAAW,UAAU,EAAE,KAAK;AACzD,UAAI,MAAM,EAAG,OAAM,IAAI,MAAM,iCAAiC;AAC9D,aAAO,MAAM,IAAI,GAAG,EAAE,WAAW;AAAA,IACnC;AAAA,EACF,SAAS,GAAG;AAAE,QAAI,0BAA0B,CAAC,EAAE;AAAA,EAAG;AAClD,SAAO;AACT;AAEA,SAAS,SAAS,KAAoB,SAAiB;AACrD,MAAI,MAAqB,SAAS,EAAE,QAAQ,OAAO,OAAO,OAAO;AACjE,MAAI,MAAqB,cAAc,EAAE,QAAQ,OAAO,OAAO,aAAa;AAC5E,MAAI,MAAqB,YAAY,EAAE,QAAQ,OAAO,OAAO,UAAU;AACvE,MAAI,MAAqB,eAAe,EAAE,QAAQ,OAAO,OAAO,cAAc;AAChF;AAEA,SAAS,KAAK,GAAkB,SAAiB,GAAe;AAAE,SAAQ,EAAE,OAAO,IAAI,EAAU,OAAO,GAAG,CAAC;AAAG;AAI/G,SAAS,OAAO,KAA4B;AAC1C,MAAI;AACF,UAAM,MAAM,KAAK,KAAK,aAAa;AACnC,QAAI,CAAC,OAAO,IAAI,OAAO,OAAO,EAAG,QAAO;AACxC,UAAM,IAAI,KAAK,IAAI,OAAO,IAAI,MAAM,GAAG,IAAI;AAC3C,QAAI,IAAI;AACR,aAAS,IAAI,GAAG,IAAI,GAAG,IAAK,MAAK,OAAO,aAAa,OAAO,IAAI,IAAI,CAAC,CAAC,CAAC;AACvE,WAAO,YAAY,CAAC;AAAA,EACtB,SAAS,GAAG;AAAE,WAAO,gBAAgB,CAAC;AAAA,EAAK;AAC7C;AAMA,IAAM,iBAAiB;AACvB,SAAS,gBAAwC;AAC/C,QAAM,IAA4B;AAAA,IAChC,eAAe;AAAA,IAAgB,cAAc;AAAA,IAAe,YAAY;AAAA,IACxE,SAAS;AAAA,IAAa,IAAI;AAAA,IAAW,UAAU;AAAA,IAAa,WAAW;AAAA,EACzE;AACA,MAAI;AACF,UAAM,QAAQ,KAAK,MAAO,KAAa,YAAY,cAAc,CAAC;AAClE,eAAW,KAAK,OAAO,KAAK,KAAK,EAAG,GAAE,CAAC,IAAI,OAAO,MAAM,CAAC,CAAC;AAC1D,QAAI,yBAAyB,cAAc,EAAE;AAAA,EAC/C,SAAS,GAAG;AAAE,QAAI,4CAA4C;AAAA,EAAG;AACjE,SAAO;AACT;AAEA,SAAS,QAAQ,MAAc,IAAgB,WAAW,OAAO;AAC/D,MAAI;AAAE,OAAG;AAAG,QAAI,QAAQ,IAAI,EAAE;AAAA,EAAG,SAC1B,GAAG;AACR,QAAI,SAAU,KAAI,QAAQ,IAAI,KAAK,CAAC,+CAA+C,CAAC;AAAA,QAC/E,KAAI,QAAQ,IAAI,KAAK,CAAC,EAAE;AAAA,EAC/B;AACF;AACA,SAAS,IAAI,KAAmB,MAA4B;AAC1D,QAAM,IAAI,IAAI,SAAS,IAAI;AAC3B,MAAI,EAAG,QAAO;AACd,QAAM,QAAQ,KAAK,MAAM,GAAG,EAAE,IAAI;AAClC,QAAM,MAAM,IAAI,QAAQ,KAAK,OAAK,EAAE,SAAS,SAAS,EAAE,kBAAkB,IAAI;AAC9E,MAAI,CAAC,IAAK,OAAM,IAAI,MAAM,SAAS,IAAI,YAAY;AACnD,SAAO;AACT;AAEA,SAAS,kBAAkB,KAAoB,OAAsB;AACnE,MAAI,OAAO,OAAO,IAAI,MAAM,EAAE,OAAO,QAAQ,EAAE,OAAO,KAAK;AAC7D;AAEA,IAAM,iBAAiB;AAEvB,OAAO,QAAQ,MAAM;AACnB,QAAM,MAAM,OAAO,OAAO,SAAS,iBAAiB,EAAE;AACtD,MAAI,mBAAmB,OAAO,YAAY,8BAA8B;AAExE,QAAM,QAAQ,IAAI,KAAK,2BAA2B;AAClD,QAAM,aAAa,OAAO,KAAK,YAAY,YAAY;AACvD,QAAM,WAAW,OAAO,KAAK,YAAY,sBAAsB;AAC/D,QAAM,UAAU,OAAO,KAAK,YAAY,yBAAyB;AACjE,QAAM,cAAc,MAAM,QAAQ,KAAK,OAAK,EAAE,SAAS,UAAU,EAAE,aAAa,EAAE,SAAS,WAAW,CAAC;AACvG,QAAM,YAAY,YAAY,QAAQ,UAAU,UAAU;AAC1D,QAAM,WAAW,YAAY,QAAQ,SAAS,UAAU;AAExD,WAAS,UAAU,UAAyB,UAAgC,UAAyB,IAAmB;AACtH,UAAM,OAAO,SAAS,IAAI;AAC1B,aAAS,MAAM,YAAY,QAAQ,CAAC;AACpC,SAAK,MAAqB,eAAe,EAAE,QAAQ,OAAO,OAAO,cAAc;AAC/E,SAAK,MAAqB,iBAAiB,EAAE,QAAQ,OAAO,OAAO,cAAc;AACjF,SAAK,MAAe,eAAe,EAAE,QAAQ;AAC7C,SAAK,MAAqB,UAAU,EAAE,QAAQ;AAC9C,SAAK,MAAqB,SAAS,EAAE,QAAQ,OAAO,OAAO,EAAE;AAC7D,SAAK,MAAqB,oBAAoB,EAAE,QAAQ,OAAO,OAAO,WAAW,CAAC;AAClF,cAAU,OAAO,MAAM,UAAU,OAAO,OAAO,gBAAgB,GAAG,MAAM,EAAE;AAAA,EAC5E;AACA,WAAS,SAAS,aAA4B,UAAyB,UAAgC,UAAyB,IAAmB;AACjJ,UAAM,OAAO,QAAQ,IAAI;AACzB,aAAS,MAAM,YAAY,QAAQ,CAAC;AACpC,SAAK,MAAqB,eAAe,EAAE,QAAQ,OAAO,OAAO,cAAc;AAC/E,SAAK,MAAqB,iBAAiB,EAAE,QAAQ,OAAO,OAAO,cAAc;AACjF,SAAK,MAAqB,UAAU,EAAE,QAAQ;AAC9C,SAAK,MAAqB,SAAS,EAAE,QAAQ,OAAO,OAAO,EAAE;AAC7D,SAAK,MAAqB,oBAAoB,EAAE,QAAQ,OAAO,OAAO,WAAW,CAAC;AAClF,aAAS;AAAA,MAAO;AAAA,MAAM;AAAA,MAAU,OAAO,OAAO,wBAAwB;AAAA,MACpE,YAAY,MAAqB,OAAO,EAAE;AAAA,MAAO;AAAA,IAAE;AAAA,EACvD;AAGA,UAAQ,yCAAyC,MAAM;AACrD,UAAM,OAAO,IAAI,KAAK,0CAA0C;AAChE,SAAK,OAAO,QAAQ,EAAE,iBAAiB,SAAU,UAAU,IAAI;AAC7D,UAAI,uBAAuB;AAC3B,wBAAkB,IAAqB,CAAC;AAAA,IAC1C;AACA,SAAK,OAAO,WAAW,EAAE,iBAAiB,SAAU,aAAa,SAAS,IAAI;AAC5E,UAAI,oBAAoB;AACxB,YAAM,MAAM;AACZ;AAAA,QAAU,IAAI,MAAqB,cAAc,EAAE;AAAA,QACjD,IAAI,MAAqB,kBAAkB,EAAE;AAAA,QAC7C,IAAI,MAAqB,iBAAiB,EAAE;AAAA,QAAO;AAAA,MAAmB;AAAA,IAC1E;AACA,SAAK,OAAO,oBAAoB,EAAE,iBAAiB,SAAU,aAAa,UAAU,MAAM,UAAU,UAAU,IAAI;AAChH,UAAI,+BAA+B;AACnC;AAAA,QAAS;AAAA,QAA8B;AAAA,QAA2B;AAAA,QAChE;AAAA,QAA2B;AAAA,MAAmB;AAAA,IAClD;AAAA,EACF,GAAG,IAAI;AAGP,UAAQ,wCAAwC,MAAM;AACpD,UAAM,KAAK,IAAI,KAAK,yCAAyC;AAC7D,OAAG,OAAO,QAAQ,EAAE,iBAAiB,SAAU,IAAI;AACjD,UAAI,8BAA8B;AAClC,wBAAkB,IAAqB,CAAC;AAAA,IAC1C;AACA,OAAG,OAAO,iCAAiC,EAAE,iBAAiB,SAAU,IAAI;AAC1E,UAAI,wCAAwC;AAC5C,wBAAkB,IAAqB,OAAO,OAAO,EAAE,EAAE,MAAM;AAAA,IACjE;AACA,OAAG,OAAO,QAAQ,EAAE,iBAAiB,SAAU,aAAa,UAAU,MAAM,UAAU,UAAU,IAAI;AAClG,UAAI,yCAAyC;AAC7C,gBAAU,UAA2B,UAA2B,UAA2B,EAAmB;AAAA,IAChH;AACA,OAAG,OAAO,eAAe,EAAE,iBAAiB,SAAU,aAAa,UAAU,MAAM,UAAU,UAAU,IAAI;AACzG,UAAI,+CAA+C;AACnD;AAAA,QAAS;AAAA,QAA8B;AAAA,QAA2B;AAAA,QAChE;AAAA,QAA2B;AAAA,MAAmB;AAAA,IAClD;AAAA,EACF,GAAG,IAAI;AASP,QAAM,YAAY,cAAc;AAChC,QAAM,YAAY,OAAO,OAAO,MAAM,aAAa;AAGnD,WAAS,gBAAgB,KAAoB,KAAmB;AAC9D,QAAI;AACF,UAAI,IAAI,QAAQ,eAAe,IAAI,EAAG;AACtC,YAAM,MAAM,KAAK,KAAK,aAAa;AACnC,UAAI,CAAC,OAAO,IAAI,OAAO,OAAO,GAAG;AAAE,YAAI,eAAe,IAAI,MAAM,GAAG,EAAE,IAAI,CAAC,cAAc;AAAG;AAAA,MAAQ;AACnG,YAAM,MAAM,OAAO,IAAI,MAAM;AAC7B,UAAI,MAAM;AACV,eAAS,IAAI,GAAG,IAAI,KAAK,IAAK,QAAO,OAAO,aAAa,OAAO,IAAI,IAAI,CAAC,CAAC,CAAC;AAC3E,YAAM,MAAM,KAAK,MAAM,mBAAmB,OAAO,GAAG,CAAC,CAAC;AACtD,UAAI,OAAO,QAAQ,YAAY,QAAQ,QAAQ,EAAE,mBAAmB,MAAM;AACxE,YAAI,eAAe,IAAI,MAAM,GAAG,EAAE,IAAI,CAAC,uBAAuB;AAC9D;AAAA,MACF;AACA,YAAM,UAAoB,CAAC;AAC3B,iBAAW,KAAK,OAAO,KAAK,SAAS,GAAG;AACtC,YAAI,KAAK,OAAO,IAAI,CAAC,MAAM,UAAU,CAAC,GAAG;AAAE,cAAI,CAAC,IAAI,UAAU,CAAC;AAAG,kBAAQ,KAAK,CAAC;AAAA,QAAG;AAAA,MACrF;AAGA,UAAI,IAAI,QAAQ,8BAA8B,KAAK,GAAG;AACpD,YAAI,cAAc,iBAAiB;AACnC,YAAI,QAAQ,QAAQ,aAAa,IAAI,EAAG,SAAQ,KAAK,aAAa;AAAA,MACpE;AACA,UAAI,QAAQ,WAAW,GAAG;AAAE,YAAI,eAAe,IAAI,MAAM,GAAG,EAAE,IAAI,CAAC,kBAAkB;AAAG;AAAA,MAAQ;AAChG,YAAM,MAAM,SAAS,mBAAmB,KAAK,UAAU,GAAG,CAAC,CAAC;AAC5D,YAAM,MAAM,OAAO,MAAc,WAAW,IAAI,MAAM;AACtD,eAAS,IAAI,GAAG,IAAI,IAAI,QAAQ,IAAK,KAAI,IAAI,GAAG,IAAI,WAAW,CAAC,CAAC;AACjE,WAAK,KAAK,eAAe,GAAG;AAC5B,UAAI,WAAW,IAAI,MAAM,GAAG,EAAE,IAAI,CAAC,KAAK,QAAQ,KAAK,GAAG,CAAC,EAAE;AAAA,IAC7D,SAAS,GAAG;AAAE,UAAI,qBAAqB,CAAC,EAAE;AAAA,IAAG;AAAA,EAC/C;AAGA,MAAI,eAA8D;AAClE,WAAS,aAAa,KAAoB,KAAmB;AAC3D,QAAI;AACF,UAAI,IAAI,QAAQ,8BAA8B,IAAI,EAAG;AACrD,YAAM,MAAM,KAAK,KAAK,aAAa;AACnC,UAAI,CAAC,OAAO,IAAI,OAAO,OAAO,EAAG;AACjC,YAAM,SAAS,OAAO,IAAI,MAAM;AAChC,UAAI,OAAO;AACX,eAAS,IAAI,GAAG,IAAI,QAAQ,IAAK,SAAQ,OAAO,aAAa,OAAO,IAAI,IAAI,CAAC,CAAC,CAAC;AAC/E,YAAM,OAAO,KAAK,MAAM,mBAAmB,OAAO,IAAI,CAAC,CAAC;AACxD,UAAI,QAAQ,KAAK,SAAU,gBAAe,EAAE,UAAU,OAAO,KAAK,QAAQ,GAAG,UAAU,OAAO,KAAK,YAAY,EAAE,EAAE;AAAA,IACrH,SAAS,GAAG;AAAE,UAAI,6BAA6B,CAAC,EAAE;AAAA,IAAG;AAAA,EACvD;AAGA,UAAQ,mBAAmB,MAAM;AAC/B,gBAAY,OAAO,IAAI,KAAK,6BAA6B,EAAE,OAAO,cAAc,EAAE,gBAAgB;AAAA,MAChG,QAAQ,MAAM;AACZ,aAAK,CAAC,IAAI,OAAO,OAAO,YAAY,EAAE;AACtC,aAAK,CAAC,IAAI,OAAO,OAAO,UAAU,EAAE;AACpC,aAAK,CAAC,IAAI,IAAI,CAAC;AACf,YAAI,qCAAqC;AAAA,MAC3C;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAGD,UAAQ,gBAAgB,MAAM;AAC5B,gBAAY,OAAO,IAAI,KAAK,sBAAsB,EAAE,OAAO,uBAAuB,EAAE,gBAAgB;AAAA,MAClG,QAAQ,KAAK;AAAE,YAAI,QAAQ,IAAI,CAAC,CAAC;AAAA,MAAG;AAAA,IACtC,CAAC;AAAA,EACH,CAAC;AACD,MAAI,iBAAiB;AACrB,UAAQ,eAAe,MAAM;AAC3B,QAAI,OAAO;AACX,UAAM,IAAI,IAAI,KAAK,sBAAsB,EAAE,OAAO,oBAAoB,CAAC;AACvE,gBAAY,OAAO,EAAE,gBAAgB;AAAA,MACnC,QAAQ,MAAM;AACZ,YAAI,eAAgB;AACpB,YAAI;AACF,gBAAM,MAAM,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACrC,cAAI,MAAM;AACV,cAAI;AAAE,kBAAM,QAAQ,KAAK,KAAK,aAAa,OAAO,OAAO,4BAA4B,CAAC,CAAC;AAAA,UAAG,SAAS,GAAG;AAAA,UAAC;AACvG,cAAI,CAAC,IAAK,KAAI,OAAO,WAAW,EAAE,OAAO,OAAO,OAAO,4BAA4B,GAAG,OAAO,OAAO,cAAc,CAAC;AACnH,gBAAM,MAAM,OAAO,KAAK,KAAK,SAAS,CAAC;AACvC,uBAAa,KAAK,GAAG;AACrB,0BAAgB,KAAK,GAAG;AACxB,cAAI,SAAS,GAAI,KAAI,MAAM,GAAG,UAAU,OAAO,GAAG,CAAC,EAAE;AAAA,QACvD,SAAS,GAAG;AAAE,cAAI,sBAAsB,CAAC,EAAE;AAAA,QAAG;AAAA,MAChD;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAED,UAAQ,cAAc,MAAM;AAC1B,QAAI,OAAO;AACX,gBAAY,OAAO,IAAI,KAAK,sBAAsB,EAAE,OAAO,cAAc,EAAE,gBAAgB;AAAA,MACzF,QAAQ,MAAM;AACZ,cAAM,UAAU,UAAU;AAC1B,YAAI,CAAC,WAAW,CAAC,aAAc;AAC/B,YAAI;AACF,gBAAM,MAAM,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACrC,gBAAM,MAAM,OAAO,KAAK,KAAK,SAAS,CAAC;AACvC,gBAAM,QAAQ,OAAO,KAAK,KAAK,WAAW,CAAC;AAC3C,gBAAM,OAAO,KAAK,KAAK,cAAc;AACrC,cAAI,OAAO;AACX,cAAI,SAAS;AACb,cAAI,OAAO;AACX,cAAI,QAAQ,CAAC,KAAK,OAAO,OAAO,GAAG;AACjC,kBAAM,OAAO,OAAO,KAAK,MAAM,gBAAgB,CAAC;AAChD,qBAAS;AACT,gBAAI;AAAE,qBAAO,OAAO,KAAK,MAAM,gBAAgB,GAAG,WAAW,EAAE;AAAA,YAAG,SAAS,GAAG;AAAA,YAAC;AAC/E,mBAAO,UAAU,IAAI,UAAU,YAAY,IAAI,EAAE,QAAQ,QAAQ,GAAG,EAAE,MAAM,GAAG,GAAG,CAAC;AAAA,UACrF,OAAO;AACL,gBAAI;AAAE,qBAAO,cAAc,KAAK,KAAK,eAAe,CAAC;AAAA,YAAI,SAAS,GAAG;AAAA,YAAC;AAAA,UACxE;AACA,cAAI,SAAS;AACX,gBAAI,OAAO;AACX,6BAAiB;AACjB,gBAAI;AAAE,qBAAO,kBAAkB,YAAY,OAAO,KAAK,KAAK,aAAa,CAAC,CAAC,EAAE,QAAQ,QAAQ,GAAG,EAAE,MAAM,GAAG,GAAG,CAAC;AAAA,YAAI,SAAS,GAAG;AAAA,YAAC,UAChI;AAAU,+BAAiB;AAAA,YAAO;AAClC,gBAAI,MAAM,KAAK,IAAI,GAAG,IAAI,IAAI,GAAG,IAAI,EAAE;AAAA,UACzC;AAIA,cAAI,gBAAgB,IAAI,QAAQ,8BAA8B,KAAK,GAAG;AACpE,gBAAI,aAA4B;AAChC,gBAAI,WAAW;AACf,gBAAI;AACF,oBAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,kBAAI,OAAO,MAAM,eAAe,SAAU,cAAa,KAAK;AAC5D,yBAAW,OAAO,MAAM,MAAM,UAAU,YAAY,KAAK,KAAK,MAAM,SAAS;AAAA,YAC/E,SAAS,GAAG;AAAA,YAAC;AACb,gBAAI,WAAW,QAAQ,eAAe,KAAM,eAAe,QAAQ,WAAY;AAC7E,8BAAgB,aAAa,UAAU,aAAa,QAAQ;AAC5D,8BAAgB;AAAA,YAClB,WAAW,WAAW,OAAO,eAAe,MAAM;AAChD,8BAAgB;AAChB,8BAAgB;AAChB,kBAAI,8CAA8C,UAAU,sCAAsC;AAAA,YACpG,WAAW,WAAW,GAAG;AACvB,kBAAI,wEAAwE;AAAA,YAC9E,OAAO;AACL,kBAAI,4CAA4C,MAAM,wCAAwC;AAAA,YAChG;AACA,2BAAe;AAAA,UACjB;AAAA,QACF,SAAS,GAAG;AAAE,cAAI,gBAAgB,CAAC,EAAE;AAAA,QAAG;AAAA,MAC1C;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAGD,QAAM,QAAQ,CAAC,MAAqB;AAAE,QAAI;AAAE,aAAO,EAAE,OAAO,IAAI,KAAK,OAAO,IAAI,OAAO,OAAO,CAAC,EAAE,WAAW,EAAE;AAAA,IAAG,SAAS,GAAG;AAAE,aAAO;AAAA,IAAK;AAAA,EAAE;AAC7I,QAAM,QAAQ,CAAC,MAAqB;AAAE,QAAI;AAAE,aAAO,EAAE,OAAO,IAAI,KAAK,OAAO,KAAK,IAAI,OAAO,OAAO,CAAC,GAAG,aAAa,CAAC;AAAA,IAAG,SAAS,GAAG;AAAE,aAAO;AAAA,IAAK;AAAA,EAAE;AACpJ,QAAM,SAAS,CAAC,MAAc,QAAgB,YAAY,MAAM;AAC9D,UAAM,IAAI,IAAI,KAAK,IAAI;AACvB,UAAM,IAAI,EAAE,QAAQ,KAAK,OAAK,EAAE,KAAK,SAAS,MAAM,KAAK,CAAC,yBAAyB,KAAK,EAAE,IAAI,KAAK,EAAE,kBAAkB,SAAS;AAChI,QAAI,CAAC,EAAG,OAAM,IAAI,MAAM,GAAG,IAAI,KAAK,MAAM,YAAY;AACtD,WAAO;AAAA,EACT;AAEA,UAAQ,uCAAuC,MAAM;AACnD,gBAAY,OAAO,OAAO,gBAAgB,WAAW,CAAC,EAAE,gBAAgB;AAAA,MACtE,QAAQ,MAAM;AAAE,YAAI,6BAA6B,KAAK,CAAC,EAAE,QAAQ,CAAC,aAAa,MAAM,KAAK,CAAC,CAAC,CAAC,EAAE;AAAA,MAAG;AAAA,IACpG,CAAC;AAAA,EACH,CAAC;AACD,UAAQ,sCAAsC,MAAM;AAClD,UAAM,KAAK;AACX,gBAAY,OAAO,OAAO,IAAI,QAAQ,EAAE,gBAAgB,EAAE,UAAU;AAAE,UAAI,oBAAoB;AAAA,IAAG,EAAE,CAAC;AACpG,gBAAY,OAAO,OAAO,IAAI,SAAS,EAAE,gBAAgB,EAAE,QAAQ,MAAM;AAAE,UAAI,uBAAuB,MAAM,KAAK,CAAC,CAAC,CAAC,EAAE;AAAA,IAAG,EAAE,CAAC;AAC5H,gBAAY,OAAO,OAAO,IAAI,UAAU,EAAE,gBAAgB;AAAA,MACxD,QAAQ,MAAM;AAAE,YAAI,6BAA6B,KAAK,CAAC,EAAE,QAAQ,IAAI,KAAM,QAAQ,MAAM,KAAK,CAAC,CAAC,CAAC,EAAE;AAAA,MAAG;AAAA,IACxG,CAAC;AAAA,EACH,CAAC;AACD,UAAQ,oCAAoC,MAAM;AAChD,UAAM,KAAK;AACX,gBAAY,OAAO,OAAO,IAAI,sBAAsB,EAAE,gBAAgB,EAAE,UAAU;AAAE,UAAI,gCAAgC;AAAA,IAAG,EAAE,CAAC;AAC9H,gBAAY,OAAO,OAAO,IAAI,kBAAkB,EAAE,gBAAgB,EAAE,QAAQ,MAAM;AAAE,UAAI,8BAA8B,MAAM,KAAK,CAAC,CAAC,CAAC,EAAE;AAAA,IAAG,EAAE,CAAC;AAC5I,gBAAY,OAAO,OAAO,IAAI,WAAW,EAAE,gBAAgB,EAAE,QAAQ,MAAM;AAAE,UAAI,6BAA6B,KAAK,CAAC,EAAE,QAAQ,CAAC,QAAQ,MAAM,KAAK,CAAC,CAAC,CAAC,EAAE;AAAA,IAAG,EAAE,CAAC;AAAA,EAC/J,CAAC;AAED,QAAM,SAAS,CAAC,MAA6B;AAC3C,QAAI;AACF,UAAI,EAAE,OAAO,EAAG,QAAO;AACvB,YAAM,IAAI,EAAE,IAAI,EAAI,EAAE,QAAQ;AAC9B,aAAO,KAAK,KAAK,IAAI,MAAO,EAAE,IAAI,EAAI,EAAE,gBAAgB,CAAC,KAAK,KAAM,eAAe,CAAC;AAAA,IACtF,SAAS,GAAG;AAAE,aAAO;AAAA,IAAgB;AAAA,EACvC;AAOA,UAAQ,8BAA8B,MAAM;AAC1C,QAAI,SAAS;AACb,gBAAY,OAAO,OAAO,mCAAmC,yBAAyB,EAAE,gBAAgB;AAAA,MACtG,UAAU;AAAE,iBAAS;AAAA,MAAM;AAAA,MAC3B,UAAU;AAAE,iBAAS;AAAA,MAAO;AAAA,IAC9B,CAAC;AACD,QAAI,OAAO;AACX,gBAAY,OAAO,OAAO,iBAAiB,0BAA0B,EAAE,gBAAgB;AAAA,MACrF,QAAQ,KAAK;AAAE,YAAI,QAAQ;AAAE,cAAI,QAAQ,IAAI,CAAC,CAAC;AAAG,cAAI,SAAS,EAAG,KAAI,qEAAqE;AAAA,QAAG;AAAA,MAAE;AAAA,IAClJ,CAAC;AACD,QAAI,QAAQ;AACZ,gBAAY,OAAO,OAAO,gBAAgB,0BAA0B,EAAE,gBAAgB;AAAA,MACpF,QAAQ,KAAK;AAAE,YAAI,QAAQ,IAAI,CAAC,CAAC;AAAG,YAAI,UAAU,EAAG,KAAI,kEAAkE;AAAA,MAAG;AAAA,IAChI,CAAC;AAED,QAAI;AACF,UAAI,YAAY;AAChB,YAAM,MAAM,IAAI,KAAK,iCAAiC;AACtD,kBAAY,OAAO,IAAI,OAAO,yBAAyB,EAAE,gBAAgB;AAAA,QACvE,QAAQ,MAAM;AAAE,cAAI,+CAA+C,OAAO,KAAK,CAAC,CAAC,CAAC,IAAI;AAAA,QAAG;AAAA,MAC3F,CAAC;AACD,YAAM,QAAQ,IAAI,KAAK,gDAAgD;AACvE,kBAAY,OAAO,MAAM,OAAO,SAAS,CAAC,EAAE,gBAAgB;AAAA,QAC1D,QAAQ,MAAM;AAAE,cAAI,cAAc,EAAG,KAAI,sCAAsC,OAAO,KAAK,CAAC,CAAC,CAAC,IAAI;AAAA,QAAG;AAAA,MACvG,CAAC;AAAA,IACH,SAAS,GAAG;AAAE,UAAI,qBAAqB,CAAC,EAAE;AAAA,IAAG;AAAA,EAC/C,CAAC;AAMD,UAAQ,0CAA0C,MAAM;AACtD,UAAM,UAAU,IAAI,KAAK,cAAc;AACvC,UAAM,MAAM,IAAI,KAAK,iCAAiC;AACtD,UAAM,OAAO,IAAI,QAAQ,KAAK,OAAK,EAAE,SAAS,YAAY;AAC1D,QAAI,CAAC,KAAM,OAAM,IAAI,MAAM,yCAAyC;AACpE,UAAM,YAAY,CAAC,MAAmB;AACpC,UAAI;AAAE,eAAO,OAAO,CAAC,IAAI,WAAY,EAAoB,MAAM;AAAA,MAAM,SAAS,GAAG;AAAE,eAAO;AAAA,MAAO;AAAA,IACnG;AACA,gBAAY,OAAO,KAAK,gBAAgB;AAAA,MACtC,QAAQ,MAAM;AACZ,YAAI;AAMF,cAAI,cAAoC;AACxC,gBAAM,SAAS,QAAQ,MAAqB,0BAA0B,EAAE;AACxE,cAAI,UAAU,MAAM,MAAM,oBAAqB,eAAc;AAC7D,cAAI,CAAC,aAAa;AAChB,gBAAI,+EAA+E;AACnF;AAAA,UACF;AACA,gBAAM,QAAQ,MAAM,OAAO,KAAK,YAAa,MAAqB,UAAU,EAAE,OAAO,WAAW,CAAC;AACjG,gBAAM,SAAS,MAAM;AACrB,cAAI,WAAW,GAAG;AAChB,kBAAM,OAAO,OAAQ,QAAQ,OAAO,oBAAoB,EAAU,OAAO,GAAG,WAAW,EAAE;AACzF,gBAAI,0BAA0B,IAAI,EAAE;AACpC,iBAAK,aAAa,QAAQ,OAAO,OAAO,IAAI,CAAC;AAK7C,gBAAI,MAAM,MAAM,GAAG;AACjB,kBAAI;AACF,sBAAM,YAAY,OAAO,OAAO,MAAM,gBAAgB;AACtD,sBAAM,SAAU,UAAU,OAAO,QAAQ,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC;AAC7E,oBAAI,QAAQ,MAAM,GAAG;AACnB,wBAAM,OAAO,OAAQ,UAAU,OAAO,aAAa,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC,GAAG,WAAW,EAAE;AACvG,sBAAI,KAAK,SAAS,GAAG;AACnB,oBAAC,YAAY,OAAO,gBAAgB,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC;AACxE,wBAAI,uCAAuC,MAAM,CAAC,wBAAwB;AAAA,kBAC5E;AAAA,gBACF;AAAA,cACF,SAAS,GAAG;AAAE,oBAAI,mCAAmC,CAAC,EAAE;AAAA,cAAG;AAAA,YAC7D;AAAA,UACF;AACA,cAAI,uDAAuD,MAAM,OAAO,MAAM,CAAC,EAAE;AAAA,QACnF,SAAS,GAAG;AAAE,cAAI,4BAA4B,CAAC,EAAE;AAAA,QAAG;AAAA,MACtD;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAED,UAAQ,sBAAsB,MAAM;AAClC,UAAM,IAAI,IAAI,KAAK,mBAAmB,EAAE,QAAQ,KAAK,OAAK,EAAE,SAAS,MAAM;AAC3E,QAAI,CAAC,EAAG,OAAM,IAAI,MAAM,kCAAkC;AAC1D,QAAI,OAAO;AACX,gBAAY,OAAO,EAAE,gBAAgB;AAAA,MACnC,QAAQ,MAAM;AAAE,eAAO,OAAO,KAAK,CAAC,CAAC;AAAA,MAAG;AAAA;AAAA,MACxC,QAAQ,KAAK;AAAE,YAAI,2BAA2B,IAAI,SAAS,IAAI,QAAQ,IAAI,MAAO,OAAO,QAAQ,EAAE;AAAA,MAAG;AAAA,IACxG,CAAC;AAAA,EACH,CAAC;AAMD,UAAQ,uBAAuB,MAAM;AACnC,UAAM,OAAO,OAAO,OAAO,SAAS,wBAAwB,EAAE;AAC9D,UAAM,QAAQ,KAAK,MAAM,mBAAmB;AAC5C,UAAM,UAAU,KAAK,MAAM,qBAAqB;AAKhD,UAAM,YAAY;AAClB,UAAM,WAAW,MAAM,OAAO,4BAA4B,CAAC;AAC3D,gBAAY,OAAO,SAAS,gBAAgB;AAAA,MAC1C,QAAQ,MAAM;AACZ,cAAM,QAAQ,KAAK,CAAC,EAAE,QAAQ;AAC9B,YAAI,QAAQ,WAAW;AACrB,cAAI,yBAAyB,KAAK,OAAO,SAAS,EAAE;AACpD,eAAK,CAAC,IAAI,IAAI,SAAS;AAAA,QACzB;AAAA,MACF;AAAA,IACF,CAAC;AAED,QAAI,UAAU;AACd,gBAAY,OAAO,QAAQ,OAAO,sBAAsB,CAAC,EAAE,gBAAgB;AAAA,MACzE,UAAU;AAAE,YAAI,YAAY,EAAG,KAAI,uCAAuC;AAAA,MAAG;AAAA,MAC7E,QAAQ,KAAK;AAAE,YAAI,QAAQ,IAAI,CAAC,CAAC;AAAA,MAAG;AAAA,IACtC,CAAC;AAAA,EACH,CAAC;AAsBD,QAAM,WAAW;AACjB,QAAM,qBAAqB;AAC3B,QAAM,iBAAiB;AACvB,QAAM,mBAAmB;AACzB,QAAM,eAAe,GAAG,eAAe,GAAG,cAAc;AAGxD,QAAM,eAAuD;AAAA,IAC3D,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,MACrC,mCAAmC;AAAA,IACrC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,IACA,IAAI;AAAA,MACF,oCAAoC;AAAA,MACpC,8BAA8B;AAAA,MAC9B,+BAA+B;AAAA,MAC/B,qCAAqC;AAAA,IACvC;AAAA,EACF;AAOA,WAAS,iBAAyB;AAChC,QAAI;AACF,YAAM,OAAQ,KAAK,yBAAyB,EAAE,OAAO,wBAAwB,EAAU,OAAO;AAC9F,aAAO,OAAO,MAAM,WAAW,gEAAgE;AAAA,IACjG,SAAS,GAAG;AAAE,aAAO;AAAA,IAAkE;AAAA,EACzF;AAEA,WAAS,aAAa,MAAsB;AAC1C,QAAI;AACF,YAAM,OAAO,OAAO,OAAO,MAAM,gBAAgB;AACjD,UAAI,CAAC,QAAS,KAAK,OAAO,QAAQ,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC,CAAC,EAAG,QAAO;AACjF,aAAO,OAAQ,KAAK,OAAO,aAAa,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC,GAAG,WAAW,EAAE;AAAA,IAC9F,SAAS,GAAG;AAAE,aAAO;AAAA,IAAI;AAAA,EAC3B;AAEA,WAAS,cAAc,MAAc,MAAuB;AAC1D,QAAI;AACF,MAAC,OAAO,OAAO,MAAM,gBAAgB,EAAE,OAAO,cAAc,EACzD,OAAO,OAAO,OAAO,IAAI,GAAG,OAAO,OAAO,IAAI,CAAC;AAClD,aAAO;AAAA,IACT,SAAS,GAAG;AAAE,aAAO;AAAA,IAAO;AAAA,EAC9B;AAIA,WAAS,mBAA2B;AAClC,QAAI,MAAM;AACV,aAAS,IAAI,GAAG,IAAI,IAAI,IAAK,QAAO,KAAK,MAAM,KAAK,OAAO,IAAI,GAAG,EAAE,SAAS,EAAE,EAAE,SAAS,GAAG,GAAG;AAChG,WAAO;AAAA,EACT;AAGA,WAAS,QAAQ,UAAwB,MAA4B;AACnE,UAAM,IAAI,MAAM,MAAM;AACtB,IAAC,EAAE,OAAO,SAAS,KAAK,MAAM,EAAU,OAAO,GAAG,IAAI;AACtD,WAAO;AAAA,EACT;AAEA,WAAS,OAAO,GAAiB;AAC/B,WAAO,CAAC,KAAK,CAAC,EAAE,UAAU,EAAE,OAAO,OAAO;AAAA,EAC5C;AAIA,QAAM,aAA2C,CAAC;AAClD,MAAI,YAAmC;AACvC,WAAS,KAAK,MAA4B;AACxC,UAAM,SAAS,WAAW,IAAI;AAC9B,QAAI,OAAQ,QAAO;AACnB,QAAI,CAAC,UAAW,aAAY,OAAO,OAAO,WAAW,IAAI,OAAK,EAAE,KAAK;AACrE,UAAM,QAAQ,UAAU,KAAK,OAAK,EAAE,SAAS,IAAI,KAAK,IAAI;AAC1D,QAAI,CAAC,MAAO,OAAM,IAAI,MAAM,SAAS,IAAI,4BAA4B;AACrE,UAAM,QAAQ,MAAM,SAAS,IAAI;AACjC,eAAW,IAAI,IAAI;AACnB,WAAO;AAAA,EACT;AAGA,WAAS,QAAQ,WAAyB,GAA6B;AACrE,UAAM,QAAQ,UAAU,MAAM;AAC9B,UAAM,MAAc,SAAS,EAAE,QAAQ;AACvC,WAAO,MAAM,MAAM;AAAA,EACrB;AAGA,WAAS,KAAK,GAAW,GAA6B;AACpD,UAAM,QAAQ,KAAK,qBAAqB,EAAE,MAAM;AAChD,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,WAAO,MAAM,MAAM;AAAA,EACrB;AAEA,WAAS,MAAM,GAAW,GAAW,GAAW,GAA6B;AAC3E,UAAM,QAAQ,KAAK,mBAAmB,EAAE,MAAM;AAC9C,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,UAAM,MAAc,GAAG,EAAE,QAAQ;AACjC,WAAO,MAAM,MAAM;AAAA,EACrB;AAGA,WAAS,YAAY,MAAsB;AACzC,QAAI;AACF,YAAM,KAAM,IAAI,KAAK,iCAAiC,EAAE,OAAO,cAAc,EAAU,OAAO;AAC9F,UAAI,OAAO,EAAE,EAAG,QAAO;AACvB,YAAM,MAAM,KAAK,IAAI,eAAe;AACpC,UAAI,OAAO,GAAG,EAAG,QAAO;AACxB,aAAO,OAAO,KAAK,KAAK,OAAO,IAAI,GAAG,WAAW,EAAE;AAAA,IACrD,SAAS,GAAG;AAAE,aAAO;AAAA,IAAI;AAAA,EAC3B;AAGA,WAAS,YAAoB;AAC3B,QAAI;AACF,YAAM,KAAM,IAAI,KAAK,iCAAiC,EAAE,OAAO,cAAc,EAAU,OAAO;AAC9F,UAAI,OAAO,EAAE,EAAG,QAAO;AACvB,YAAM,OAAO,KAAK,IAAI,cAAc;AACpC,UAAI,OAAO,IAAI,EAAG,QAAO;AACzB,aAAO,OAAQ,KAAK,MAAW,OAAO,EAAE,OAAyB,WAAW,EAAE;AAAA,IAChF,SAAS,GAAG;AAAE,aAAO;AAAA,IAAI;AAAA,EAC3B;AAIA,WAAS,QAAQ,KAAa,UAAmB,IAA4C;AAE3F,UAAM,OAAO,CAAC,QAAgB,SAAiB;AAC7C,UAAI,WAAW,GAAI,KAAI,YAAY,GAAG,YAAY,IAAI,EAAE;AACxD,SAAG,QAAQ,IAAI;AAAA,IACjB;AACA,QAAI;AAEF,YAAM,WAAW,OAAO,OAAO,SAAS,YAAY,KAAK,OAAO,OAAO,SAAS,QAAQ,EAAE,MAAM,MAAM,YAAY;AAClH,YAAM,MAAM,QAAQ,UAAU,OAAO,OAAO,GAAG,CAAC;AAChD,YAAM,MAAM,OAAO,SAAS,IAAI,KAAK,oCAAoC,GAAG,CAACc,MAAU,SAAc;AACnG,YAAI;AACF,cAAI,OAAO,IAAI,GAAG;AAChB,gBAAI,MAAM;AACV,gBAAI;AAAE,qBAAO,WAAW,KAAKA,MAAK,WAAW,CAAC,eAAe,KAAKA,MAAK,eAAe,CAAC;AAAA,YAAI,SAAS,GAAG;AAAA,YAAC;AACxG,iBAAK,IAAI,GAAG;AACZ;AAAA,UACF;AACA,gBAAM,SAAS,OAAO,KAAK,MAAM,gBAAgB,CAAC;AAClD,cAAI,OAAO;AACX,cAAI;AAAE,mBAAO,OAAO,KAAK,MAAM,gBAAgB,GAAG,WAAW,EAAE;AAAA,UAAG,SAAS,GAAG;AAAA,UAAC;AAC/E,aAAG,QAAQ,IAAI;AAAA,QACjB,SAAS,GAAG;AAAE,eAAK,IAAI,OAAO,CAAC,CAAC;AAAA,QAAG;AAAA,MACrC,CAAC;AAGD,YAAM,eAAe,IAAI,KAAK,sBAAsB;AACpD,YAAM,MAAM,aAAa,MAAM;AAC/B,YAAM,OAAO,aAAa,QAAQ,KAAK,OAAK,EAAE,SAAS,WAAW,EAAE,mBAAmB,KAClF,eAAe,KAAK,OAAO,EAAE,WAAW,CAAC,GAAG,MAAM,IAAI,CAAC,CAAC;AAC7D,UAAI,QAAQ;AACZ,UAAI,MAAM;AACR,YAAI;AAAE,UAAC,KAAK,KAAK,GAAG,EAAU,OAAO,KAAK,GAAG,GAAG;AAAG,kBAAQ;AAAA,QAAM,SAC1D,GAAG;AAAE,cAAI,iDAAiD,CAAC,8BAA8B;AAAA,QAAG;AAAA,MACrG;AACA,UAAI,CAAC,MAAO,CAAC,IAAI,OAAO,SAAS,CAAC,EAAU,OAAO,KAAK,GAAG;AAC3D,MAAC,IAAI,OAAO,WAAW,EAAU,OAAO,OAAO,OAAO,QAAQ,GAAG,OAAO,OAAO,kBAAkB,CAAC;AAClG,UAAI,UAAU;AACZ,cAAM,QAAQ,UAAU;AACxB,YAAI,MAAO,CAAC,IAAI,OAAO,WAAW,EAAU,OAAO,OAAO,OAAO,eAAe,GAAG,OAAO,OAAO,YAAY,KAAK,CAAC;AAAA,YAC9G,KAAI,YAAY,GAAG,iDAAiD;AAAA,MAC3E;AACA,MAAC,IAAI,OAAO,MAAM,EAAU,OAAO;AAAA,IACrC,SAAS,GAAG;AAAE,WAAK,IAAI,OAAO,CAAC,CAAC;AAAA,IAAG;AAAA,EACrC;AAOA,UAAQ,mBAAmB,MAAM;AAC/B,UAAM,SAAS,IAAI,KAAK,wBAAwB;AAChD,UAAM,aAAa,OAAO,OAAO,wBAAwB;AACzD,UAAM,cAAc,IAAI,KAAK,2BAA2B;AAExD,gBAAY,OAAO,IAAI,KAAK,cAAc,EAAE,OAAO,UAAU,EAAE,gBAAgB;AAAA,MAC7E,UAAU;AACR,YAAI;AACF,gBAAM,WAAY,YAAY,OAAO,cAAc,EAAU,OAAO;AACpE,gBAAM,UAAU,OAAO,QAAQ,IAAI,KAAK,OAAO,KAAK,UAAU,aAAa,GAAG,WAAW,EAAE;AAC3F,gBAAM,UAAU,KAAK,UAAU,EAAE,iBAAiB,MAAM,QAAQ,CAAC;AACjE,UAAC,WAAmB,OAAO,OAAO,OAAO,cAAc,GAAG,OAAO,OAAO,OAAO,CAAC;AAChF,cAAI,sCAAsC,WAAW,aAAa,GAAG;AAAA,QACvE,SAAS,GAAG;AAAE,cAAI,6BAA6B,CAAC,EAAE;AAAA,QAAG;AAAA,MACvD;AAAA,IACF,CAAC;AAED,gBAAY,OAAO,IAAI,KAAK,WAAW,EAAE,OAAO,sBAAsB,EAAE,gBAAgB;AAAA,MACtF,UAAU;AACR,YAAI;AACF,UAAC,WAAmB,OAAO,OAAO,OAAO,SAAS,GAAG,OAAO,OAAO,IAAI,CAAC;AACxE,cAAI,2BAA2B;AAAA,QACjC,SAAS,GAAG;AAAE,cAAI,wBAAwB,CAAC,EAAE;AAAA,QAAG;AAAA,MAClD;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AASD,QAAM,YAAY,oBAAI,IAA8C;AACpE,MAAI,iBAAwB,CAAC;AAO7B,QAAM,UAA4C,CAAC;AACnD,WAAS,SAAS,SAAiB,IAAgB;AACjD,YAAQ,KAAK,EAAE,IAAI,KAAK,IAAI,IAAI,SAAS,GAAG,CAAC;AAAA,EAC/C;AACA,WAAS,aAAa;AACpB,UAAM,MAAM,KAAK,IAAI;AACrB,aAAS,IAAI,QAAQ,SAAS,GAAG,KAAK,GAAG,KAAK;AAC5C,UAAI,QAAQ,CAAC,EAAE,KAAK,IAAK;AACzB,YAAM,OAAO,QAAQ,OAAO,GAAG,CAAC,EAAE,CAAC;AACnC,UAAI;AACF,eAAO,WAAW,SAAS,MAAM;AAC/B,cAAI;AAAE,iBAAK,GAAG;AAAA,UAAG,SAAS,GAAG;AAAE,gBAAI,0BAA0B,CAAC,EAAE;AAAA,UAAG;AAAA,QACrE,CAAC;AAAA,MACH,SAAS,GAAG;AAAE,YAAI,8BAA8B,CAAC,EAAE;AAAA,MAAG;AAAA,IACxD;AAAA,EACF;AACA,UAAQ,yBAAyB,MAAM;AACrC,UAAM,WAAW,IAAI,KAAK,iCAAiC;AAC3D,UAAM,SAAS,SAAS,QAAQ,KAAK,OAAK,EAAE,SAAS,QAAQ;AAC7D,QAAI,CAAC,OAAQ,OAAM,IAAI,MAAM,kCAAkC;AAC/D,gBAAY,OAAO,OAAO,gBAAgB,EAAE,UAAU;AAAE,iBAAW;AAAA,IAAG,EAAE,CAAC;AAAA,EAC3E,CAAC;AAID,MAAI,qBAAqB;AAEzB,WAAS,QAAQ,MAAc,QAAwB;AACrD,UAAM,QAAQ,OAAO;AACrB,WAAO,UAAU,IAAI,IAAI,KAAK,MAAO,OAAO,MAAO,KAAK;AAAA,EAC1D;AAEA,WAAS,iBAAiB,QAAQ,OAAO;AACvC,UAAM,OAAO,YAAY,kBAAkB;AAC3C,QAAI,CAAC,KAAM;AACX,UAAM,MAAM,KAAK,IAAI;AACrB,QAAI,CAAC,SAAS,MAAM,qBAAqB,IAAM;AAC/C,yBAAqB;AACrB,YAAQ,GAAG,IAAI,mBAAmB,MAAM,CAAC,QAAQ,SAAS;AACxD,UAAI,WAAW,KAAK;AAAE,YAAI,0BAA0B,MAAM,EAAE;AAAG;AAAA,MAAQ;AACvE,UAAI;AACF,cAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,cAAM,QAAQ,KAAK,SAAS,KAAK,QAAQ,CAAC;AAC1C,kBAAU,MAAM;AAChB,mBAAW,MAAM,OAAO;AACtB,oBAAU,IAAI,OAAO,GAAG,MAAM,GAAG,EAAE,MAAM,OAAO,GAAG,IAAI,IAAI,GAAG,QAAQ,OAAO,GAAG,MAAM,IAAI,EAAE,CAAC;AAAA,QAC/F;AACA,YAAI,eAAe,UAAU,IAAI,QAAQ;AACzC,8BAAsB;AAAA,MACxB,SAAS,GAAG;AAAE,YAAI,+BAA+B,CAAC,EAAE;AAAA,MAAG;AAAA,IACzD,CAAC;AAAA,EACH;AAEA,WAAS,sBAAsB;AAC7B,UAAM,OAAO,YAAY,cAAc;AACvC,QAAI,CAAC,KAAM;AACX,YAAQ,GAAG,IAAI,sBAAsB,MAAM,CAAC,QAAQ,SAAS;AAC3D,UAAI,WAAW,KAAK;AAAE,YAAI,6BAA6B,MAAM,EAAE;AAAG;AAAA,MAAQ;AAC1E,UAAI;AACF,cAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,cAAM,UAAU,KAAK,WAAW,CAAC;AACjC,yBAAiB,QAAQ,IAAI,CAAC,OAAY;AAAA,UACxC,UAAU,EAAE;AAAA,UACZ,QAAQ,OAAO,EAAE,MAAM;AAAA,UACvB,UAAU,OAAO,EAAE,YAAY,EAAE;AAAA,UACjC,WAAW,EAAE,YAAY,EAAE,MAAM,OAAO,EAAE,UAAU,IAAI,IAAI,GAAG,QAAQ,OAAO,EAAE,UAAU,MAAM,IAAI,EAAE,IAAI;AAAA,UAC1G,kBAAkB,OAAO,EAAE,oBAAoB,EAAE;AAAA,UACjD,mBAAmB,EAAE,oBAAoB,EAAE,MAAM,OAAO,EAAE,kBAAkB,IAAI,IAAI,GAAG,QAAQ,OAAO,EAAE,kBAAkB,MAAM,IAAI,EAAE,IAAI;AAAA,QAC5I,EAAE;AACF,YAAI,kBAAkB,eAAe,MAAM,UAAU;AAAA,MACvD,SAAS,GAAG;AAAE,YAAI,kCAAkC,CAAC,EAAE;AAAA,MAAG;AAAA,IAC5D,CAAC;AAAA,EACH;AAEA,UAAQ,6BAA6B,MAAM;AAEzC,gBAAY,OAAO,IAAI,KAAK,uBAAuB,EAAE,OAAO,YAAY,EAAE,gBAAgB;AAAA,MACxF,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,WAAW,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AAC1C,cAAI,QAAQ,SAAS,MAAW,YAAY,EAAE,KAAK,MAAM,EAAG;AAC5D,8BAAoB;AAAA,QACtB,SAAS,GAAG;AAAE,cAAI,sBAAsB,CAAC,EAAE;AAAA,QAAG;AAAA,MAChD;AAAA,IACF,CAAC;AAGD,gBAAY,OAAO,IAAI,KAAK,2BAA2B,EAAE,OAAO,YAAY,EAAE,gBAAgB;AAAA,MAC5F,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,WAAW,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AAC1C,cAAI,QAAQ,SAAS,MAAW,YAAY,EAAE,KAAK,MAAM,EAAG;AAC5D,2BAAiB;AAAA,QACnB,SAAS,GAAG;AAAE,cAAI,0BAA0B,CAAC,EAAE;AAAA,QAAG;AAAA,MACpD;AAAA,IACF,CAAC;AAID,eAAW,QAAQ,CAAC,cAAc,YAAY,YAAY,GAAG;AAC3D,YAAM,SAAS,IAAI,KAAK,2BAA2B,EAAE,OAAO,IAAI;AAChE,UAAI,CAAC,OAAQ;AACb,kBAAY,OAAO,OAAO,gBAAgB;AAAA,QACxC,UAAU;AAAE,mBAAS,KAAM,MAAM,iBAAiB,IAAI,CAAC;AAAA,QAAG;AAAA,MAC5D,CAAC;AAAA,IACH;AAAA,EACF,CAAC;AAKD,QAAM,YAAY,oBAAI,IAAY;AAElC,WAAS,wBAAwB;AAC/B,eAAW,OAAO,MAAM,KAAK,SAAS,GAAG;AACvC,UAAI;AACF,cAAM,OAAO,IAAI,OAAO,OAAO,IAAI,GAAG,CAAC;AACvC,YAAI,KAAK,MAAM,SAAS,YAAY;AAAE,oBAAU,OAAO,GAAG;AAAG;AAAA,QAAU;AACvE,4BAAoB,IAAI;AAAA,MAC1B,SAAS,GAAG;AAAE,kBAAU,OAAO,GAAG;AAAA,MAAG;AAAA,IACvC;AAAA,EACF;AAEA,WAAS,oBAAoB,MAAqB;AAChD,QAAI;AACF,YAAM,YAAY,KAAK,MAAM,eAAe;AAC5C,UAAI,OAAO,SAAS,EAAG;AACvB,YAAM,YAAY,KAAK,WAAW,QAAQ,OAAO,OAAO,uBAAuB,CAAC;AAChF,UAAI,OAAO,SAAS,EAAG;AACvB,YAAM,iBAAiB,KAAK,WAAW,QAAQ,OAAO,OAAO,mBAAmB,CAAC;AACjF,UAAI,OAAO,cAAc,EAAG;AAC5B,YAAM,QAAS,eAAuB,OAAO,cAAc,EACxD,SAAS,aAAa,EAAE,OAAO,KAAK,qBAAqB,EAAE,KAAK,MAAM;AACzE,UAAI,OAAO,KAAK,EAAG;AACnB,YAAM,QAAQ,UAAU,IAAI,OAAO,KAAK,MAAM,WAAW,CAAC,CAAC;AAC3D,YAAM,OAAO,QAAQ,GAAG,MAAM,IAAI,IAAI,MAAM,MAAM,KAAK,QAAQ,MAAM,MAAM,MAAM,MAAM,CAAC,OAAO;AAC/F,MAAC,MAAM,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,IAAI,CAAC;AAC5D,UAAI,OAAO;AAET,cAAM,gBAAiB,UAAkB,OAAO,cAAc,EAC3D,SAAS,aAAa,EAAE,OAAO,KAAK,2BAA2B,EAAE,KAAK,MAAM;AAC/E,cAAM,QAAQ,OAAO,KAAK,OAAO,oBAAoB,CAAC,IAAI;AAC1D,cAAM,SAAS,OAAO,KAAK,OAAO,qBAAqB,CAAC,IAAI;AAC5D,YAAI,CAAC,OAAO,aAAa,EAAG,CAAC,cAAc,OAAO,eAAe,EAAU,OAAO,KAAK,OAAO,MAAM,CAAC;AAAA,MACvG;AACA,YAAM,cAAc,KAAK,gBAAgB,gBAAgB;AACzD,UAAI,CAAC,OAAO,WAAW,EAAG,CAAC,YAAY,OAAO,WAAW,EAAU,OAAO,SAAS,IAAI;AAAA,IACzF,SAAS,GAAG;AAAE,UAAI,2BAA2B,CAAC,EAAE;AAAA,IAAG;AAAA,EACrD;AAEA,MAAI,kBAAkB;AAEtB,WAAS,oBAAoB,MAAqB;AAChD,QAAI;AACF,YAAM,WAAW,KAAK,MAAqB,cAAc,EAAE;AAC3D,UAAI,OAAO,QAAQ,EAAG;AAEtB,YAAM,SAAS,KAAK,MAAM,eAAe;AACzC,UAAI,OAAO,MAAM,EAAG;AAEpB,YAAM,aAAa,KAAK,wBAAwB;AAChD,YAAM,WAAW,KAAK,2BAA2B;AAEjD,YAAM,YAAY;AAAA,QAAQ;AAAA,QAAY,OAAO,OAAO,uBAAuB;AAAA,QACzE,OAAO,MAAM,OAAO,OAAO,MAAM,aAAa,GAAG,CAAC,SAAS,KAAK,MAAM,CAAC;AAAA,MAAC;AAC1E,YAAM,qBAAqB,KAAK,WAAW,eAAe;AAC1D,MAAC,mBAAmB,OAAO,aAAa,CAAC,EAAU,OAAO,QAAQ,KAAK;AACvE,YAAM,gBAAiB,UAAkB,OAAO,cAAc,EAC3D,SAAS,aAAa,EAAE,OAAO,SAAS,KAAK,MAAM;AACtD,UAAI,CAAC,OAAO,aAAa,GAAG;AAC1B,QAAC,cAAc,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAChE,QAAC,cAAc,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAChE,QAAC,cAAc,OAAO,WAAW,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAC5D,QAAC,cAAc,OAAO,sBAAsB,EAAU,OAAO,KAAK,IAAI,CAAC,CAAC;AAAA,MAC1E;AAEA,YAAM,aAAa;AAAA,QAAQ;AAAA,QAAY,OAAO,OAAO,YAAY;AAAA,QAC/D,OAAO,MAAM,OAAO,OAAO,MAAM,aAAa,GAAG,CAAC,SAAS,KAAK,MAAM,CAAC;AAAA,MAAC;AAC1E,YAAM,sBAAsB,KAAK,YAAY,eAAe;AAC5D,MAAC,oBAAoB,OAAO,aAAa,CAAC,EAAU,OAAO,oBAAoB,KAAK;AACpF,YAAM,kBAAmB,WAAmB,OAAO,cAAc,EAC9D,SAAS,aAAa,EAAE,OAAO,KAAK,sBAAsB,EAAE,KAAK,MAAM;AAC1E,YAAM,iBAAkB,WAAmB,OAAO,cAAc,EAC7D,SAAS,aAAa,EAAE,OAAO,SAAS,KAAK,MAAM;AACtD,UAAI,CAAC,OAAO,cAAc,GAAG;AAC3B,QAAC,eAAe,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AACjE,QAAC,eAAe,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AACjE,QAAC,eAAe,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AACjE,QAAC,eAAe,OAAO,sBAAsB,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAAA,MAC1E;AACA,UAAI,CAAC,OAAO,eAAe,GAAG;AAC5B,QAAC,gBAAgB,OAAO,WAAW,EAAU,OAAO,MAAM,GAAG,GAAG,GAAG,GAAG,CAAC;AACvE,QAAC,gBAAgB,OAAO,mBAAmB,EAAU,OAAO,KAAK;AAAA,MACnE;AAIA,YAAM,cAAc,KAAK,oBAAoB;AAC7C,YAAM,cAAc,YAAY,QAAQ,KAAK,OAAK,EAAE,SAAS,iBAAiB,CAAC,EAAE,aAAa,EAAE,mBAAmB,KAC9G,aAAa,KAAK,OAAO,EAAE,WAAW,CAAC,GAAG,MAAM,IAAI,CAAC,CAAC,KAAK,YAAY,OAAO,eAAe,CAAC;AACnG,YAAM,QAAS,YAAoB,OAAO,UAAU,oBAAoB,KAAK;AAC7E,UAAI,OAAO,KAAK,EAAG;AACnB,MAAC,MAAM,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,mBAAmB,CAAC;AAC3E,MAAC,MAAM,OAAO,eAAe,EAAU,OAAO,CAAC;AAE/C,YAAM,WAAW,OAAO,KAAK,OAAO,cAAc,CAAC;AACnD,YAAM,YAAY,KAAK,IAAI,IAAI,KAAK,MAAM,WAAW,GAAG,CAAC;AACzD,UAAI,CAAC,iBAAiB;AAAE,0BAAkB;AAAM,YAAI,6BAA6B,QAAQ,OAAO,SAAS,EAAE;AAAA,MAAG;AAC9G,MAAC,MAAM,OAAO,cAAc,EAAU,OAAO,SAAS;AACtD,MAAC,MAAM,OAAO,wBAAwB,EAAU,OAAO,CAAC;AACxD,MAAC,MAAM,OAAO,sBAAsB,EAAU,OAAO,CAAC;AACtD,MAAC,MAAM,OAAO,mBAAmB,EAAU,OAAO,KAAK;AACvD,YAAM,YAAY,KAAK,OAAO,mBAAmB;AACjD,UAAI,CAAC,OAAO,SAAS,GAAG;AACtB,QAAC,UAAU,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAC5D,QAAC,UAAU,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAC5D,QAAC,UAAU,OAAO,WAAW,EAAU,OAAO,KAAK,KAAK,GAAG,CAAC;AAC5D,QAAC,UAAU,OAAO,sBAAsB,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AACnE,QAAC,UAAU,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,CAAC,CAAC;AAC5D,QAAC,UAAU,OAAO,eAAe,EAAU,OAAO,KAAK,GAAG,GAAG,CAAC;AAC9D,QAAC,UAAU,OAAO,eAAe,EAAU,OAAO,KAAK,IAAI,IAAI,CAAC;AAAA,MAClE;AACA,YAAM,cAAc,KAAK,OAAO,gBAAgB;AAChD,UAAI,CAAC,OAAO,WAAW,EAAG,CAAC,YAAY,OAAO,WAAW,EAAU,OAAO,KAAK;AAAA,IACjF,SAAS,GAAG;AAAE,UAAI,oCAAoC,CAAC,EAAE;AAAA,IAAG;AAAA,EAC9D;AAEA,UAAQ,4BAA4B,MAAM;AACxC,UAAM,WAAW,IAAI,KAAK,UAAU;AAEpC,gBAAY,OAAO,SAAS,OAAO,WAAW,CAAC,EAAE,gBAAgB;AAAA,MAC/D,QAAQ,MAAM;AACZ,YAAI;AACF,eAAK,OAAO,KAAK,CAAC;AAClB,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACtC,oBAAU,IAAI,KAAK,OAAO,SAAS,CAAC;AACpC,gBAAM,YAAY,KAAK,MAAM,eAAe;AAC5C,cAAI,OAAO,SAAS,EAAG;AACvB,gBAAM,YAAY,KAAK,WAAW,QAAQ,OAAO,OAAO,uBAAuB,CAAC;AAChF,cAAI,OAAO,SAAS,EAAG,qBAAoB,IAAI;AAAA,QACjD,SAAS,GAAG;AAAE,cAAI,6BAA6B,CAAC,EAAE;AAAA,QAAG;AAAA,MACvD;AAAA,MACA,UAAU;AACR,YAAI;AACF,cAAI,CAAC,KAAK,KAAM;AAChB,8BAAoB,IAAI,OAAO,OAAO,KAAK,IAAI,CAAC;AAAA,QAClD,SAAS,GAAG;AAAA,QAAC;AAAA,MACf;AAAA,IACF,CAAC;AAED,gBAAY,OAAO,SAAS,OAAO,OAAO,EAAE,gBAAgB;AAAA,MAC1D,QAAQ,MAAM;AAAE,aAAK,OAAO,KAAK,CAAC;AAAA,MAAG;AAAA,MACrC,UAAU;AAAE,YAAI;AAAE,oBAAU,IAAI,KAAK,KAAK,SAAS,CAAC;AAAA,QAAG,SAAS,GAAG;AAAA,QAAC;AAAA,MAAE;AAAA,IACxE,CAAC;AAED,eAAW,QAAQ,CAAC,aAAa,WAAW,GAAG;AAC7C,YAAM,OAAO,SAAS,QAAQ,KAAK,OAAK,EAAE,SAAS,QAAQ,EAAE,mBAAmB,CAAC;AACjF,UAAI,KAAM,aAAY,OAAO,KAAK,gBAAgB,EAAE,QAAQ,MAAM;AAAE,kBAAU,OAAO,KAAK,CAAC,EAAE,SAAS,CAAC;AAAA,MAAG,EAAE,CAAC;AAAA,UACxG,KAAI,wBAAwB,IAAI,wDAAwD;AAAA,IAC/F;AAAA,EACF,CAAC;AAMD,QAAM,aAAa;AAAA,IAAC;AAAA,IAAkB;AAAA,IAAmB;AAAA,IAAgB;AAAA,IAAgB;AAAA,IAAc;AAAA,IACrG;AAAA,IAAe;AAAA,IAAiB;AAAA,IAAoB;AAAA,IAAkB;AAAA,IAAmB;AAAA,EAAiB;AAC5G,QAAM,cAAc;AAAA,IAAC;AAAA,IAAW;AAAA,IAAY;AAAA,IAAS;AAAA,IAAS;AAAA,IAAO;AAAA,IAAQ;AAAA,IAAQ;AAAA,IAAU;AAAA,IAC7F;AAAA,IAAW;AAAA,IAAY;AAAA,EAAU;AAEnC,WAAS,UAAU,OAAuB;AACxC,QAAI;AACF,YAAM,KAAM,IAAI,KAAK,qBAAqB,EAAE,OAAO,cAAc,EAAU,OAAO;AAClF,UAAI,CAAC,OAAO,EAAE,GAAG;AACf,cAAM,OAAO,KAAK,IAAI,WAAW,WAAW,QAAQ,CAAC,CAAC;AACtD,YAAI,QAAQ,KAAK,QAAS,QAAO,OAAO,KAAK,OAAO;AAAA,MACtD;AAAA,IACF,SAAS,GAAG;AAAA,IAAC;AACb,WAAO,YAAY,QAAQ,CAAC,KAAK;AAAA,EACnC;AAEA,WAAS,YAAY,MAAqB,OAAe,SAAwB,MAAY,KAAa,SAAkB;AAC1H,UAAM,OAAO,KAAK,MAAqB,MAAM,EAAE;AAC/C,QAAI,CAAC,OAAO,IAAI,EAAG,CAAC,KAAK,OAAO,WAAW,EAAU,OAAO,IAAI;AAChE,UAAM,YAAY,KAAK,MAAqB,WAAW,EAAE;AACzD,QAAI,CAAC,OAAO,SAAS,EAAG,CAAC,UAAU,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,KAAK,CAAC;AACzF,QAAI,WAAW,WAAW,MAAM;AAC9B,YAAM,cAAc,KAAK,MAAqB,iBAAiB,EAAE;AACjE,UAAI,CAAC,OAAO,WAAW,EAAG,CAAC,YAAY,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,OAAO,CAAC;AAAA,IACjG;AACA,UAAM,YAAY,KAAK,MAAqB,WAAW,EAAE;AACzD,QAAI,CAAC,OAAO,SAAS,EAAG,CAAC,UAAU,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,UAAU,KAAK,SAAS,IAAI,CAAC,CAAC,CAAC;AAClH,UAAM,UAAU,KAAK,MAAqB,SAAS,EAAE;AACrD,QAAI,CAAC,OAAO,OAAO,EAAG,CAAC,QAAQ,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,OAAO,KAAK,QAAQ,CAAC,CAAC,CAAC;AACtG,UAAM,SAAS,KAAK,MAAqB,QAAQ,EAAE;AACnD,QAAI,OAAO,MAAM,EAAG;AACpB,UAAM,UAAU,KAAK,QAAQ,aAAa;AAC1C,QAAI,OAAO,OAAO,EAAG;AACrB,IAAC,QAAQ,OAAO,oBAAoB,EAAU,OAAO;AACrD,UAAM,SAAS,OAAO,SAAS,KAAK,gCAAgC,GAAG,MAAM;AAC3E,UAAI;AAAE,QAAC,KAAK,yBAAyB,EAAE,OAAO,SAAS,EAAU,OAAO,OAAO,OAAO,GAAG,CAAC;AAAA,MAAG,SAAS,GAAG;AAAA,MAAC;AAAA,IAC5G,CAAC;AACD,IAAC,QAAQ,OAAO,aAAa,EAAU,OAAO,MAAM;AAAA,EACtD;AAEA,WAAS,eAAe,QAAuB;AAC7C,YAAQ,UAAU,OAAO,CAAC,QAAQ,SAAS;AACzC,UAAI;AACF,YAAI,WAAW,KAAK;AAAE,cAAI,cAAc,MAAM,EAAE;AAAG;AAAA,QAAQ;AAC3D,cAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,cAAM,QAAe,KAAK,SAAS,CAAC;AACpC,cAAM,UAAU,OAAO,MAAqB,kBAAkB,EAAE;AAChE,cAAM,YAAY,OAAO,MAAmC,qBAAqB,EAAE;AACnF,iBAAS,IAAI,GAAG,IAAI,MAAM,QAAQ,KAAK;AACrC,gBAAM,OAAO,MAAM,CAAC;AACpB,gBAAM,OAAO,IAAI,KAAK,OAAO,KAAK,SAAS,EAAE,QAAQ,KAAK,GAAG,CAAC;AAC9D,cAAI,MAAM,GAAG;AACX,gBAAI,CAAC,OAAO,OAAO,EAAG,aAAY,SAAS,OAAO,KAAK,SAAS,EAAE,GAAG,OAAO,KAAK,WAAW,EAAE,GAAG,MAAM,OAAO,KAAK,OAAO,EAAE,GAAG,IAAI;AAAA,UACrI,WAAW,CAAC,OAAO,SAAS,KAAK,IAAI,IAAI,UAAU,QAAQ;AACzD,kBAAM,QAAQ,UAAU,IAAI,IAAI,CAAC;AACjC,gBAAI,CAAC,OAAO,KAAK,EAAG,aAAY,OAAO,OAAO,KAAK,SAAS,EAAE,GAAG,MAAM,MAAM,OAAO,KAAK,OAAO,EAAE,GAAG,KAAK;AAAA,UAC5G;AAAA,QACF;AAGA,cAAM,UAAU,OAAO,MAAqB,YAAY,EAAE;AAC1D,YAAI,CAAC,OAAO,OAAO,EAAG,CAAC,QAAQ,OAAO,WAAW,EAAU,OAAO,KAAK;AACvE,cAAM,cAAc,OAAO,MAAqB,gBAAgB,EAAE;AAClE,YAAI,CAAC,OAAO,WAAW,EAAG,CAAC,YAAY,OAAO,WAAW,EAAU,OAAO,KAAK;AAC/E,eAAO,MAAe,iBAAiB,EAAE,QAAQ;AACjD,YAAI,SAAS,MAAM,MAAM,QAAQ;AAAA,MACnC,SAAS,GAAG;AAAE,YAAI,gBAAgB,CAAC,EAAE;AAAA,MAAG;AAAA,IAC1C,CAAC;AAAA,EACH;AAEA,UAAQ,yBAAyB,MAAM;AACrC,UAAM,SAAS,IAAI,KAAK,gBAAgB;AAGxC,UAAM,WAAW,IAAI,QAAQ,KAAK,OAAK,EAAE,SAAS,4BAA4B,EAAE,gBAAgB,SAAS,gBAAgB;AACzH,QAAI,UAAU;AACZ,YAAM,WAAW,SAAS,QAAQ,KAAK,OAAK,EAAE,SAAS,UAAU;AACjE,UAAI,UAAU;AACZ,oBAAY,OAAO,SAAS,gBAAgB;AAAA,UAC1C,QAAQ,QAAQ;AAAE,mBAAO,QAAQ,IAAI,CAAC,CAAC;AAAA,UAAG;AAAA;AAAA,QAC5C,CAAC;AAAA,MACH;AAAA,IACF,MAAO,KAAI,+CAA+C;AAE1D,gBAAY,OAAO,OAAO,OAAO,UAAU,EAAE,gBAAgB;AAAA,MAC3D,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACtC,eAAK,MAAqB,yBAAyB,EAAE,QAAQ,OAAO,OAAO,IAAI;AAC/E,yBAAe,IAAI;AAAA,QACrB,SAAS,GAAG;AAAE,cAAI,qBAAqB,CAAC,EAAE;AAAA,QAAG;AAAA,MAC/C;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAMD,UAAQ,oCAAoC,MAAM;AAChD,UAAM,SAAS,IAAI,KAAK,0BAA0B;AAClD,UAAM,YAAY,IAAI,KAAK,kBAAkB;AAC7C,UAAM,WAAW,IAAI,QAAQ,KAAK,OAAK,EAAE,SAAS,kDAC7C,EAAE,gBAAgB,SAAS,mBAAmB;AACnD,QAAI,CAAC,SAAU,OAAM,IAAI,MAAM,2CAA2C;AAC1E,UAAM,WAAW,SAAS,QAAQ,KAAK,OAAK,EAAE,SAAS,UAAU;AACjE,QAAI,CAAC,SAAU,OAAM,IAAI,MAAM,6CAA6C;AAE5E,QAAI,UAAU;AACd,gBAAY,OAAO,SAAS,gBAAgB;AAAA,MAC1C,QAAQ,MAAM;AAAE,aAAK,WAAW,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AAAA,MAAG;AAAA,MAC5D,QAAQ,QAAQ;AACd,YAAI,QAAS;AACb,YAAI,OAAO,QAAQ,MAAM,EAAG;AAC5B,kBAAU;AACV,YAAI;AACF,gBAAM,WAAY,KAAK,SAA2B,MAAW,OAAO,EAAE;AACtE,cAAI,OAAO,QAAQ,EAAG;AACtB,0BAAgB,UAAU,SAAS;AACnC,gCAAsB,QAAQ;AAC9B,cAAI,8DAA8D;AAAA,QACpE,SAAS,GAAG;AAAE,cAAI,oCAAoC,CAAC,EAAE;AAAA,QAAG;AAAA,MAC9D;AAAA,IACF,CAAC;AAED,aAAS,gBAAgB,UAAyB,YAA0B;AAC1E,YAAM,SAAS,SAAS,MAAqB,QAAQ,EAAE;AACvD,UAAI,OAAO,MAAM,EAAG;AACpB,YAAM,WAAY,OAAO,OAAO,WAAW,EAAU,OAAO;AAC5D,iBAAW,QAAQ;AAAA,QACjB,EAAE,IAAI,YAAY,MAAM,uBAAuB,OAAO,8BAA8B,MAAM,mCAAmC;AAAA,QAC7H,EAAE,IAAI,YAAY,MAAM,wBAAwB,OAAO,+BAA+B,MAAM,oCAAoC;AAAA,MAClI,GAAG;AACD,YAAI,YAAY,QAAQ,KAAK,IAAI,EAAG;AACpC,cAAM,OAAO,QAAQ,UAAU;AAC/B,cAAM,aAAa,KAAK,MAAW,YAAY,EAAE;AACjD,mBAAW,MAAM,IAAI,EAAE,QAAQ,KAAK;AACpC,mBAAW,MAAM,YAAY,EAAE,QAAQ,OAAO,OAAO,KAAK,IAAI;AAC9D,mBAAW,MAAM,gBAAgB,EAAE,QAAQ,QAAQ,IAAI,KAAK,+BAA+B,GAAG,CAAC;AAC/F,QAAC,KAAK,MAAW,OAAO,EAAE,MAA2B,MAAM,QAAQ,EAAE,QAAQ,OAAO,OAAO,KAAK,KAAK;AACrG,QAAC,KAAK,MAAW,aAAa,EAAE,MAA2B,MAAM,QAAQ,EAAE,QAAQ,OAAO,OAAO,KAAK,IAAI;AAC1G,aAAK,MAAW,QAAQ,EAAE,QAAQ,QAAQ,IAAI,KAAK,mBAAmB,GAAG,gBAAgB;AACzF,aAAK,MAAe,QAAQ,EAAE,QAAQ;AACtC,QAAC,OAAO,OAAO,KAAK,EAAU,OAAO,IAAI;AAGzC,cAAM,QAAS,OAAO,OAAO,YAAY,CAAC,EAAE,OAAO,OAAO,OAAO,OAAO,WAAW,EAAE,OAAO,CAAC,IAAI,CAAC;AAClG,cAAM,YAAc,MAAM,MAAW,YAAY,EAAE,MAChD,MAAM,YAAY,EAAE,OAAyB;AAChD,cAAM,aAAe,MAAM,MAAW,OAAO,EAAE,MAC5C,MAAM,QAAQ,EAAE,OAAyB;AAC5C,YAAI,mCAAmC,SAAS,KAAK,UAAU,GAAG;AAAA,MACpE;AACA,UAAI,uBAAuB,QAAQ,aAAa;AAAA,IAClD;AAEA,aAAS,YAAY,QAAuB,YAA6B;AACvE,UAAI;AACF,cAAM,QAAQ,OAAQ,OAAO,OAAO,WAAW,EAAU,OAAO,CAAC;AACjE,iBAAS,IAAI,GAAG,IAAI,OAAO,KAAK;AAC9B,gBAAM,QAAQ,OAAO,OAAO,YAAY,CAAC,EAAE,OAAO,CAAC;AACnD,cAAI,OAAO,KAAK,EAAG;AACnB,gBAAM,OAAS,MAAM,MAAW,YAAY,EAAE,MAC3C,MAAM,YAAY,EAAE,OAAyB;AAChD,cAAI,SAAS,WAAY,QAAO;AAAA,QAClC;AAAA,MACF,SAAS,GAAG;AAAA,MAAC;AACb,aAAO;AAAA,IACT;AAGA,aAAS,YAAY,QAAkC;AACrD,aAAO,QAAQ,IAAI,KAAK,mBAAmB,GAAG,MAAM;AAAA,IACtD;AAEA,aAAS,sBAAsB,UAAyB;AACtD,YAAM,YAAY,SAAS,MAAqB,WAAW,EAAE;AAC7D,UAAI,OAAO,SAAS,EAAG;AACvB,YAAM,QAAQ,OAAQ,UAAU,OAAO,WAAW,EAAU,OAAO,CAAC;AACpE,eAAS,IAAI,GAAG,IAAI,OAAO,KAAK;AAC9B,cAAM,WAAW,UAAU,OAAO,YAAY,CAAC,EAAE,OAAO,CAAC;AACzD,YAAI,OAAO,QAAQ,EAAG;AACtB,cAAM,OAAS,SAAS,MAAW,YAAY,EAAE,MAC9C,MAAM,YAAY,EAAE,OAAyB;AAChD,YAAI,SAAS,iCAAiC,SAAS,4BAA6B;AACpF,cAAM,QAAQ,SAAS,MAAW,gBAAgB,EAAE;AACpD,YAAI,OAAO,KAAK,EAAG;AACnB,cAAM,WAAW,MAAM,MAAW,iBAAiB,EAAE;AACrD,YAAI,OAAO,QAAQ,EAAG;AACtB,iBAAS,MAAW,OAAO,EAAE,QAC3B,OAAO,OAAO,wDAAwD;AACxE,YAAI,mDAAmD,IAAI,EAAE;AAAA,MAC/D;AAAA,IACF;AAAA,EACF,CAAC;AAKD,WAAS,QAAQ,YAA0C;AACzD,QAAI,OAAO,UAAU,EAAG,QAAO;AAC/B,QAAI;AAAE,aAAO,OAAQ,WAAW,OAAO,WAAW,EAAU,OAAO,CAAC;AAAA,IAAG,SAAS,GAAG;AAAE,aAAO;AAAA,IAAG;AAAA,EACjG;AAKA,WAAS,oBAAoB,SAAwB,MAAsB;AACzE,QAAI;AACF,UAAI,OAAO;AAGX,iBAAW,QAAQ,CAAC,MAAM,SAAS,OAAO,UAAU,IAAI,GAAG;AACzD,eAAO,aAAa,GAAG,eAAe,CAAC,sBAAsB,IAAI,OAAO;AACxE,YAAI,KAAM;AAAA,MACZ;AACA,UAAI,CAAC,KAAM,QAAO;AAClB,YAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,YAAM,OAAO,OAAO,KAAK,IAAI;AAC7B,UAAI,KAAK,WAAW,EAAG,QAAO;AAC9B,YAAM,cAAc,OAAO,OAAO,MAAM,eAAe;AACvD,YAAM,aAAa,OAAO,OAAO,MAAM,yCAAyC,EAC7E,QAAQ,aAAa,WAAW,EAAE,IAAI;AACzC,iBAAW,OAAO,MAAM;AACtB,QAAC,WAAW,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,GAAG,GAAG,OAAO,OAAO,OAAO,KAAK,GAAG,CAAC,CAAC,CAAC;AAAA,MACpG;AACA,cAAQ,MAAW,gBAAgB,EAAE,QAAQ;AAC7C,aAAO,KAAK;AAAA,IACd,SAAS,GAAG;AAAE,UAAI,uCAAuC,CAAC,EAAE;AAAG,aAAO;AAAA,IAAG;AAAA,EAC3E;AAMA,UAAQ,qBAAqB,MAAM;AACjC,UAAM,eAAe,IAAI,KAAK,qBAAqB;AACnD,QAAI,eAAe;AACnB,QAAI,cAAc;AAGlB,gBAAY,OAAO,aAAa,OAAO,eAAe,CAAC,EAAE,gBAAgB;AAAA,MACvE,QAAQ,MAAM;AAAE,YAAI,wCAAwC;AAAA,MAAG;AAAA,IACjE,CAAC;AACD,gBAAY,OAAO,aAAa,OAAO,eAAe,EAAE,gBAAgB;AAAA,MACtE,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,UAAU,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACzC,gBAAM,OAAO,OAAO,KAAK,SAAS,yBAAyB,GAAG,WAAW,IAAI;AAC7E,cAAI,OAAO,QAAQ,MAAqB,gBAAgB,EAAE;AAC1D,cAAI,UAAU,QAAQ,IAAI;AAC1B,cAAI,YAAY,GAAG;AAIjB,kBAAM,WAAW,oBAAoB,SAAS,IAAI;AAClD,gBAAI,WAAW,EAAG,KAAI,0BAA0B,QAAQ,iBAAiB,IAAI,EAAE;AAE/E,mBAAO,QAAQ,MAAqB,gBAAgB,EAAE;AACtD,sBAAU,QAAQ,IAAI;AAAA,UACxB;AACA,gBAAM,QAAQ,aAAa,IAAI;AAC/B,cAAI,iBAAiB,MAAM;AACzB,2BAAe;AACf,gBAAI,0BAA0B,IAAI,KAAK,OAAO,WAAW,QAAQ,KAAK,mBAAmB,EAAE;AAAA,UAC7F;AACA,cAAI,CAAC,MAAO;AACZ,cAAI,OAAO,IAAI,EAAG;AAElB,gBAAM,aAAa,GAAG,IAAI,IAAI,KAAK,MAAM;AACzC,cAAI,eAAe,YAAa;AAChC,wBAAc;AACd,cAAI,UAAU;AACd,qBAAW,OAAO,OAAO,KAAK,KAAK,GAAG;AAGpC,YAAC,KAAK,OAAO,UAAU,EAAU,OAAO,OAAO,OAAO,GAAG,GAAG,OAAO,OAAO,MAAM,GAAG,CAAC,CAAC;AACrF;AAAA,UACF;AACA,cAAI,yBAAyB,OAAO,oBAAoB;AAAA,QAC1D,SAAS,GAAG;AAAE,cAAI,6BAA6B,CAAC,EAAE;AAAA,QAAG;AAAA,MACvD;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAAA,EAUD,MAAM,UAAU;AAAA,IACN,OAAY;AAAA,IACZ,UAAU,oBAAI,IAAiB;AAAA,IACvC,KAAK;AAAA;AAAA,IAEL,YAAY,MAAc;AACxB,UAAI;AACF,aAAK,OAAO,IAAI,KAAK,MAAM,IAAI;AAC/B,aAAK,KAAK,KAAK,GAAG,KAAK,QAAQ;AAC/B,cAAM,SAAS,KAAK,KAAK,KAAK;AAC9B,cAAM,OAAO,KAAK,IAAI,QAAQ,KAAO;AACrC,aAAK,KAAK,KAAK,SAAS,IAAI;AAC5B,cAAM,OAAO,IAAI,SAAS,KAAK,KAAK,UAAU,IAAI,CAAC;AACnD,YAAI,OAAO;AACX,iBAAS,IAAI,OAAO,IAAI,KAAK,GAAG,KAAK;AACnC,cAAI,KAAK,UAAU,GAAG,IAAI,MAAM,WAAY;AAAE,mBAAO;AAAG;AAAA,UAAO;AAAA,QACjE;AACA,YAAI,OAAO,EAAG,OAAM,IAAI,MAAM,sBAAsB;AACpD,cAAM,QAAQ,KAAK,UAAU,OAAO,IAAI,IAAI;AAC5C,YAAI,KAAK,KAAK,UAAU,OAAO,IAAI,IAAI;AACvC,iBAAS,IAAI,GAAG,IAAI,OAAO,KAAK;AAC9B,eAAK,KAAK,KAAK,EAAE;AACjB,gBAAM,OAAO,IAAI,SAAS,KAAK,KAAK,UAAU,EAAE,CAAC;AACjD,gBAAM,SAAS,KAAK,UAAU,IAAI,IAAI;AACtC,gBAAM,OAAO,KAAK,UAAU,IAAI,IAAI;AACpC,gBAAM,UAAU,KAAK,UAAU,IAAI,IAAI;AACvC,gBAAM,WAAW,KAAK,UAAU,IAAI,IAAI;AACxC,gBAAM,aAAa,KAAK,UAAU,IAAI,IAAI;AAC1C,gBAAM,SAAS,KAAK,UAAU,IAAI,IAAI;AACtC,eAAK,KAAK,KAAK,KAAK,EAAE;AACtB,gBAAM,OAAO,WAAW,KAAK,KAAK,UAAU,OAAO,CAAC;AACpD,eAAK,QAAQ,IAAI,MAAM,EAAE,QAAQ,MAAM,OAAO,CAAC;AAC/C,gBAAM,KAAK,UAAU,WAAW;AAAA,QAClC;AACA,aAAK,KAAK;AAAA,MACZ,SAAS,GAAG;AACV,YAAI,oCAAoC,CAAC,EAAE;AAC3C,aAAK,MAAM;AAAA,MACb;AAAA,IACF;AAAA,IAEA,QAAQ;AACN,UAAI;AAAE,aAAK,MAAM,MAAM;AAAA,MAAG,SAAS,GAAG;AAAA,MAAC;AACvC,WAAK,OAAO;AAAA,IACd;AAAA,IAEA,KAAK,MAAmB;AAAE,aAAO,KAAK,QAAQ,IAAI,IAAI,KAAK;AAAA,IAAM;AAAA,IAEjE,OAAiB;AAAE,aAAO,CAAC,GAAG,KAAK,QAAQ,KAAK,CAAC;AAAA,IAAG;AAAA,IAEpD,KAAK,OAAY,MAAc,QAA6B;AAC1D,WAAK,KAAK,KAAK,KAAK,WAAW,KAAK,IAAI,IAAI;AAC5C,aAAO,KAAK,KAAK,UAAU,MAAM;AAAA,IACnC;AAAA;AAAA,IAGA,KAAK,OAAY,QAAgB;AAC/B,UAAI,MAAM,WAAW,EAAG,OAAM,IAAI,MAAM,aAAa,MAAM,0BAA0B,MAAM,MAAM,GAAG;AACpG,YAAM,OAAO,GAAG,MAAM;AACtB,YAAM,MAAM,IAAI,KAAK,MAAM,IAAI;AAC/B,UAAI;AACF,YAAI,OAAO;AACX,YAAI,WAAW;AACf,eAAO,OAAO,MAAM,MAAM;AACxB,gBAAM,IAAI,KAAK,IAAI,IAAI,OAAO,MAAM,MAAM,OAAO,IAAI;AACrD,cAAI,MAAM,KAAK,KAAK,OAAO,MAAM,CAAC,CAAC;AACnC,kBAAQ;AACR,cAAI,OAAO,YAAY,kBAAkB,OAAO,MAAM,MAAM;AAC1D,uBAAW;AACX,gBAAI,YAAY,OAAO,MAAM,GAAG,EAAE,IAAI,CAAC,IAAI,KAAK,MAAM,OAAO,OAAO,CAAC,OAAO,KAAK,MAAM,MAAM,OAAO,OAAO,CAAC,KAAK;AAAA,UACnH;AAAA,QACF;AACA,YAAI,MAAM;AAAA,MACZ,SAAS,GAAG;AACV,YAAI;AAAE,cAAI,MAAM;AAAA,QAAG,SAAS,GAAG;AAAA,QAAC;AAChC,cAAM;AAAA,MACR;AACA,eAAS,MAAM,MAAM;AAAA,IACvB;AAAA,IAEQ,WAAW,OAAoB;AACrC,WAAK,KAAK,KAAK,MAAM,MAAM;AAC3B,YAAM,OAAO,IAAI,SAAS,KAAK,KAAK,UAAU,EAAE,CAAC;AACjD,aAAO,MAAM,SAAS,KAAK,KAAK,UAAU,IAAI,IAAI,IAAI,KAAK,UAAU,IAAI,IAAI;AAAA,IAC/E;AAAA,EACF;AAEA,UAAQ,wBAAwB,MAAM;AACpC,UAAM,MAAM,QAAQ;AACpB,QAAI,CAAC,KAAK;AAAE,UAAI,gCAAgC;AAAG;AAAA,IAAQ;AAC3D,UAAM,MAAM,IAAI,UAAU,GAAG;AAC7B,QAAI;AACJ,UAAI,CAAC,IAAI,GAAI;AACb,YAAM,MAAM,IAAI,KAAK,6BAA6B;AAClD,YAAM,QAAQ,IAAI,KAAK,+BAA+B;AACtD,YAAM,iBAAiB,IAAI,KAAK,EAAE,OAAO,OAAK,EAAE,WAAW,wCAAwC,CAAC;AACpG,UAAI,CAAC,OAAO,CAAC,SAAS,CAAC,eAAe,QAAQ;AAAE,YAAI,qCAAqC;AAAG;AAAA,MAAQ;AAEpG,UAAI,KAAK;AACP,cAAM,SAAS,QAAQ;AAEvB,cAAM,OAAO,SAAS,WAAW,MAAM,IAAI;AAC3C,YAAI,UAAU,SAAS,IAAI,MAAM;AAC/B,cAAI,4CAA4C,MAAM,GAAG,QAAQ,IAAI,WAAW,IAAI,OAAO,IAAI,IAAI,YAAY,EAAE,EAAE;AACnH,wBAAc,OAAO,UAAU,GAAG,OAAO,YAAY,GAAG,CAAC,CAAC;AAC1D,cAAI,KAAK,KAAK,MAAM;AACpB,cAAI,yCAAyC;AAAA,QAC/C;AAAA,MACF;AACA,UAAI,OAAO;AACT,cAAM,SAAS,GAAG,eAAe,CAAC;AAClC,cAAM,OAAO,IAAI,SAAS,IAAI,KAAK,OAAO,GAAG,EAAE,CAAC;AAChD,cAAM,QAAQ,KAAK,UAAU,GAAG,IAAI;AACpC,YAAI,KAAK;AACT,cAAM,QAA0C,CAAC;AACjD,iBAAS,IAAI,GAAG,IAAI,OAAO,KAAK;AAC9B,gBAAM,MAAM,IAAI,SAAS,IAAI,KAAK,OAAO,IAAI,CAAC,CAAC,EAAE,UAAU,GAAG,IAAI;AAClE,gBAAM;AACN,gBAAM,OAAO,WAAW,IAAI,KAAK,OAAO,IAAI,GAAG,CAAC;AAChD,gBAAM;AACN,gBAAM,OAAO,WAAW,IAAI,SAAS,IAAI,KAAK,OAAO,IAAI,CAAC,CAAC,CAAC;AAC5D,gBAAM;AACN,gBAAM,KAAK,EAAE,MAAM,KAAK,CAAC;AAAA,QAC3B;AACA,YAAI,SAAS;AACb,YAAI,UAAU;AACd,mBAAW,KAAK,OAAO;AACrB,gBAAM,OAAO,GAAG,MAAM,IAAI,EAAE,IAAI;AAChC,cAAI,CAAC,WAAW,IAAI,GAAG;AACrB,0BAAc,KAAK,UAAU,GAAG,KAAK,YAAY,GAAG,CAAC,CAAC;AACtD,kBAAM,MAAM,IAAI,KAAK,MAAM,IAAI;AAC/B,gBAAI,OAAO;AACX,mBAAO,OAAO,EAAE,MAAM;AACpB,oBAAM,IAAI,KAAK,IAAI,IAAI,OAAO,MAAM,EAAE,OAAO,IAAI;AACjD,kBAAI,MAAM,IAAI,KAAK,OAAO,SAAS,MAAM,CAAC,CAAC;AAC3C,sBAAQ;AAAA,YACV;AACA,gBAAI,MAAM;AACV;AAAA,UACF;AACA,oBAAU,EAAE;AAAA,QACd;AACI,YAAI,YAAY,OAAO,OAAO,KAAK,+BAA+B;AAAA,MACxE,OAAO;AACL,cAAM,SAAS;AACf,cAAM,WAAY,IAAY,KAAK,EAAE,OAAO,CAAC,MAAa,EAAE,WAAW,MAAM,CAAC;AAC9E,YAAI,SAAS,QAAQ;AACnB,gBAAM,MAAM,GAAG,eAAe,CAAC;AAC/B,cAAI,UAAU;AACd,cAAI,SAAS;AACb,cAAI,QAAQ;AACZ,cAAI,WAAW;AACf,qBAAW,QAAQ,UAAU;AAC3B,kBAAM,MAAM,KAAK,UAAU,OAAO,MAAM;AACxC,kBAAM,OAAO,GAAG,GAAG,IAAI,GAAG;AAC1B,kBAAM,IAAI,IAAI,KAAK,IAAI;AACvB,gBAAI,WAAW,IAAI,MAAM,EAAE,KAAM;AACjC,gBAAI;AACF,4BAAc,KAAK,UAAU,GAAG,KAAK,YAAY,GAAG,CAAC,CAAC;AACtD,kBAAI,KAAK,GAAG,IAAI;AAChB;AACA,uBAAS,EAAE;AACX,kBAAI,QAAQ,YAAY,gBAAgB;AACtC,2BAAW;AACX,oBAAI,YAAY,OAAO,yBAAyB,KAAK,MAAM,QAAQ,OAAO,CAAC,KAAK;AAAA,cAClF;AAAA,YACF,SAAS,KAAK;AAAE;AAAU,kBAAI,uBAAuB,GAAG,YAAY,GAAG,EAAE;AAAA,YAAG;AAAA,UAC9E;AACA,cAAI,YAAY,OAAO,OAAO,SAAS,MAAM,kCAAkC,SAAS,KAAK,MAAM,YAAY,EAAE,EAAE;AAAA,QACrH;AAAA,MACF;AACA,YAAM,WAAW,IAAI,KAAK,mCAAmC;AAC7D,UAAI,UAAU;AACZ,cAAM,SAAS,GAAG,eAAe,CAAC;AAClC,YAAI,CAAC,WAAW,MAAM,GAAG;AACvB,cAAI,gCAAgC;AACpC,wBAAc,OAAO,UAAU,GAAG,OAAO,YAAY,GAAG,CAAC,CAAC;AAC1D,cAAI,KAAK,UAAU,MAAM;AAAA,QAC3B;AAAA,MACF;AAAA,IACA,UAAE;AAAU,UAAI,MAAM;AAAA,IAAG;AAAA,EAC3B,CAAC;AAQD,WAAS,UAAkB;AACzB,QAAI;AACF,YAAM,IAAI,IAAI,KAAK,mBAAmB,IAAI;AAC1C,UAAI,OAAO;AACX,UAAI,WAAW;AACf,cAAQ,OAAO,EAAE,SAAS,OAAO,IAAI;AACnC,cAAM,UAAU,KAAK,MAAM,kBAAkB;AAC7C,YAAI,QAAS,YAAW,QAAQ,SAAS;AACvC,cAAI,KAAK,QAAQ,UAAU,KAAK,GAAG;AAAE,gBAAI;AAAE,gBAAE,MAAM;AAAA,YAAG,SAAS,GAAG;AAAA,YAAC;AAAC;AAAE,mBAAO;AAAA,UAAM;AACnF,cAAI,CAAC,SAAU,YAAW;AAAA,QAC5B;AAAA,MACF;AACA,UAAI;AAAE,UAAE,MAAM;AAAA,MAAG,SAAS,GAAG;AAAA,MAAC;AAC9B,UAAI,SAAU,QAAO;AAAA,IACvB,SAAS,GAAG;AAAA,IAAC;AACb,QAAI;AACF,YAAM,OAAO,OAAQ,KAAK,yBAAyB,EAAE,OAAO,yBAAyB,EAClF,OAAO,GAAG,WAAW,EAAE;AAC1B,YAAM,IAAI,KAAK,MAAM,wBAAwB;AAC7C,aAAO,IAAI,EAAE,CAAC,IAAI;AAAA,IACpB,QAAQ;AAAE,aAAO;AAAA,IAAI;AAAA,EACvB;AAGA,WAAS,UAAkB;AACzB,UAAM,aAAa,eAAe;AAClC,UAAM,UAAU,WAAW,QAAQ,yBAAyB,EAAE;AAC9D,WAAO,GAAG,OAAO;AAAA,EACnB;AAEA,WAAS,WAAW,MAAuB;AACzC,QAAI;AACF,aAAO,QAAS,OAAO,OAAO,MAAM,gBAAgB,EAAE,OAAO,QAAQ,EAClE,OAAO,OAAO,OAAO,IAAI,CAAC,CAAC;AAAA,IAChC,SAAS,GAAG;AAAE,aAAO;AAAA,IAAO;AAAA,EAC9B;AAGA,WAAS,WAAW,MAAsB;AACxC,QAAI;AACF,YAAM,IAAI,IAAI,KAAK,MAAM,IAAI;AAC7B,UAAI;AAAE,UAAE,KAAK,GAAG,KAAK,QAAQ;AAAG,eAAO,EAAE,KAAK;AAAA,MAAG,UAAE;AAAU,UAAE,MAAM;AAAA,MAAG;AAAA,IAC1E,SAAS,GAAG;AAAE,aAAO;AAAA,IAAI;AAAA,EAC3B;AAGA,WAAS,SAAS,MAAc,IAAY;AAC1C,UAAM,OAAO,OAAO,OAAO,MAAM,gBAAgB;AACjD,IAAC,KAAK,OAAO,QAAQ,EAAU,OAAO,OAAO,OAAO,EAAE,CAAC;AACvD,IAAC,KAAK,OAAO,QAAQ,CAAC,EAAU,OAAO,OAAO,OAAO,IAAI,GAAG,OAAO,OAAO,EAAE,CAAC;AAAA,EAC/E;AAEA,WAAS,cAAc,MAAc;AACnC,QAAI;AACF,MAAC,OAAO,OAAO,MAAM,qBAAqB,EAAE,OAAO,iBAAiB,EACjE,OAAO,OAAO,OAAO,IAAI,CAAC;AAAA,IAC/B,SAAS,GAAG;AAAE,UAAI,0BAA0B,IAAI,KAAK,CAAC,EAAE;AAAA,IAAG;AAAA,EAC7D;AAEA,WAAS,WAAW,QAA6B;AAC/C,UAAM,QAAQ,IAAI,WAAW,MAAM;AACnC,QAAI,OAAO;AACX,aAAS,IAAI,GAAG,IAAI,MAAM,QAAQ,IAAK,SAAQ,OAAO,aAAa,MAAM,CAAC,CAAC;AAC3E,WAAO;AAAA,EACT;AAEA,WAAS,WAAW,MAAwB;AAC1C,UAAM,MAAM,KAAK,UAAU,GAAG,IAAI;AAClC,UAAM,OAAO,KAAK,UAAU,GAAG,IAAI;AACnC,WAAO,MAAM,OAAO;AAAA,EACtB;AAYA,QAAM,aAAa;AACnB,MAAI,iBAAiB;AACrB,MAAI,gBAAgB;AAEpB,WAAS,iBAAgE;AACvE,QAAI;AACF,YAAM,OAAO,aAAa,GAAG,eAAe,CAAC,IAAI,UAAU,EAAE;AAC7D,UAAI,CAAC,KAAM,QAAO;AAClB,YAAM,OAAO,KAAK,MAAM,IAAI;AAC5B,UAAI,CAAC,QAAQ,CAAC,KAAK,SAAU,QAAO;AACpC,aAAO,EAAE,UAAU,OAAO,KAAK,QAAQ,GAAG,UAAU,OAAO,KAAK,YAAY,EAAE,EAAE;AAAA,IAClF,SAAS,GAAG;AAAE,aAAO;AAAA,IAAM;AAAA,EAC7B;AAEA,WAAS,gBAAgB,UAAkB,UAAkB;AAC3D,QAAI,CAAC,SAAU;AACf,UAAM,OAAO,GAAG,eAAe,CAAC,IAAI,UAAU;AAC9C,QAAI,cAAc,MAAM,KAAK,UAAU,EAAE,UAAU,SAAS,CAAC,CAAC,GAAG;AAC/D,UAAI,2BAA2B,QAAQ,EAAE;AAAA,IAC3C;AAAA,EACF;AAEA,WAAS,kBAAkB;AACzB,QAAI;AACF,MAAC,OAAO,OAAO,MAAM,gBAAgB,EAAE,OAAO,QAAQ,EACnD,OAAO,OAAO,OAAO,GAAG,eAAe,CAAC,IAAI,UAAU,EAAE,CAAC;AAAA,IAC9D,SAAS,GAAG;AAAA,IAAC;AAAA,EACf;AAEA,UAAQ,cAAc,MAAM;AAC1B,UAAM,cAAc,IAAI,KAAK,qCAAqC;AAIlE,UAAM,gBAAgB,CAAC,UAAe,UAAkD;AACtF,uBAAiB;AACjB,UAAI,iBAAiB,MAAM,QAAQ,EAAE;AACrC,eAAS,KAAK,MAAM;AAClB,YAAI;AACF,gBAAM,QAAQ,YAAY,MAAM;AAChC,gBAAM,MAAqB,UAAU,EAAE,QAAQ,OAAO,OAAO,MAAM,QAAQ;AAC3E,gBAAM,MAAqB,UAAU,EAAE,QAAQ,OAAO,OAAO,MAAM,QAAQ;AAC3E,UAAC,IAAI,OAAO,OAAO,QAAe,EAAG,OAAO,QAAQ,EAAE,OAAO,MAAM,MAAM,CAAQ;AAAA,QACnF,SAAS,GAAG;AAAE,cAAI,sBAAsB,CAAC,EAAE;AAAA,QAAG;AAAA,MAChD,CAAC;AAAA,IACH;AAGA,UAAM,SAAS,IAAI,KAAK,cAAc,EAAE,OAAO,WAAW,CAAC;AAC3D,UAAM,iBAAiB,IAAI;AAAA,MAAe,OAAO;AAAA,MAAgB;AAAA,MAC/D,CAAC,WAAW,WAAW,WAAW,SAAS;AAAA,IAAC;AAC9C,WAAO,iBAAiB,SAAU,OAAO,aAAa,UAAU;AAC9D,UAAI;AACF,cAAM,QAAQ,iBAAiB,OAAO,eAAe;AACrD,YAAI,CAAC,OAAO;AACV,cAAI,gBAAgB;AAGlB,6BAAiB;AACjB,gBAAI,gBAAgB,sDAAsD,wDAAwD;AAClI,4BAAgB;AAAA,UAClB;AACA,yBAAe,KAAK,QAAQ,OAAc,aAAoB,QAAe;AAC7E;AAAA,QACF;AACA,sBAAc,UAAU,KAAK;AAAA,MAC/B,SAAS,GAAG;AACV,YAAI,qBAAqB,CAAC,EAAE;AAC5B,uBAAe,KAAK,QAAQ,OAAc,aAAoB,QAAe;AAAA,MAC/E;AAAA,IACF;AAGA,UAAM,WAAW,IAAI,KAAK,qCAAqC,EAAE,OAAO,gBAAgB,CAAC;AACzF,UAAM,mBAAmB,IAAI;AAAA,MAAe,SAAS;AAAA,MAAgB;AAAA,MACnE,CAAC,WAAW,WAAW,SAAS;AAAA,IAAC;AACnC,aAAS,iBAAiB,SAAU,OAAO,aAAa,UAAU;AAChE,UAAI;AACF,cAAM,QAAQ,iBAAiB,OAAO,eAAe;AACrD,YAAI,CAAC,OAAO;AACV,cAAI,gBAAgB;AAClB,6BAAiB;AACjB,gBAAI,gBAAgB,sDAAsD,wDAAwD;AAClI,4BAAgB;AAAA,UAClB;AACA,2BAAiB,OAAc,aAAoB,QAAe;AAClE;AAAA,QACF;AACA,sBAAc,UAAU,KAAK;AAAA,MAC/B,SAAS,GAAG;AACV,YAAI,qBAAqB,CAAC,EAAE;AAC5B,yBAAiB,OAAc,aAAoB,QAAe;AAAA,MACpE;AAAA,IACF;AAAA,EACF,CAAC;AAKD,UAAQ,uBAAuB,MAAM;AACnC,UAAM,UAAU,IAAI,KAAK,eAAe;AACxC,UAAM,WAAW,IAAI,KAAK,YAAY,EAAE,OAAO,iBAAiB;AAChE,gBAAY,OAAO,QAAQ,OAAO,uBAAuB,EAAE,gBAAgB;AAAA,MACzE,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACtC,qBAAW,CAAC,MAAM,IAAI,KAAK;AAAA,YACzB,CAAC,cAAc,kBAAkB;AAAA,YACjC,CAAC,cAAc,cAAc;AAAA,YAC7B,CAAC,aAAa,QAAQ;AAAA,YACtB,CAAC,cAAc,uBAAuB;AAAA,YACtC,CAAC,aAAa,yBAAyB;AAAA,YACvC,CAAC,aAAa,QAAQ;AAAA,YACtB,CAAC,cAAc,4BAA4B;AAAA,YAC3C,CAAC,aAAa,yBAAyB;AAAA,YACvC,CAAC,cAAc,oBAAoB;AAAA,YACnC,CAAC,aAAa,YAAY;AAAA,UAC5B,GAAyB;AACvB,kBAAM,OAAO,QAAQ,UAAU,MAAM,OAAO,OAAO,IAAI,CAAC;AACxD,YAAC,KAAK,OAAO,KAAK,EAAU,OAAO,IAAI;AAAA,UACzC;AACA,cAAI,qCAAqC;AAAA,QAC3C,SAAS,GAAG;AAAE,cAAI,mBAAmB,CAAC,EAAE;AAAA,QAAG;AAAA,MAC7C;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAMD,UAAQ,0BAA0B,MAAM;AACtC,gBAAY,OAAO,IAAI,KAAK,mBAAmB,EAAE,OAAO,sBAAsB,EAAE,gBAAgB;AAAA,MAC9F,QAAQ,MAAM;AACZ,YAAI,KAAK,CAAC,EAAE,QAAQ,MAAM,iBAAkB;AAC5C,aAAK,CAAC,IAAI,IAAI,CAAC;AACf,YAAI,qDAAqD;AAAA,MAC3D;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAQD,UAAQ,4CAA4C,MAAM;AACxD,UAAM,MAAM,IAAI,KAAK,qBAAqB;AAC1C,gBAAY,OAAO,IAAI,OAAO,OAAO,EAAE,gBAAgB;AAAA,MACrD,QAAQ,MAAM;AACZ,YAAI;AACF,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,CAAC,CAAC;AACtC,gBAAM,IAAI,KAAK,MAAM,eAAe;AACpC,cAAI,OAAO,CAAC,EAAG;AACf,gBAAM,QAAQ,KAAK,GAAG,QAAQ,OAAO,OAAO,wEAAwE,CAAC;AACrH,cAAI,OAAO,KAAK,EAAG;AACnB,gBAAM,KAAK,KAAK,OAAO,gBAAgB;AACvC,cAAI,CAAC,OAAO,EAAE,EAAG,CAAC,GAAG,OAAO,WAAW,EAAU,OAAO,IAAI;AAC5D,cAAI,2DAA2D;AAAA,QACjE,SAAS,GAAG;AAAE,cAAI,uCAAuC,CAAC,EAAE;AAAA,QAAG;AAAA,MACjE;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAED,UAAQ,gDAAgD,MAAM;AAC5D,UAAM,OAAO,IAAI,KAAK,wBAAwB;AAC9C,gBAAY,OAAO,KAAK,OAAO,UAAU,EAAE,gBAAgB;AAAA,MACzD,QAAQ,MAAM;AAAE,aAAK,OAAO,KAAK,CAAC;AAAA,MAAG;AAAA,MACrC,UAAU;AACR,YAAI;AACF,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,IAAI;AACxC,gBAAM,YAAY,KAAK,MAAqB,YAAY,EAAE;AAC1D,cAAI,OAAO,SAAS,EAAG;AACvB,gBAAM,SAAS,QAAQ,UAAU,MAAW,QAAQ,EAAE,KAAK;AAC3D,cAAI,WAAW,iBAAkB;AACjC,gBAAM,KAAK,KAAK,MAAqB,iBAAiB,EAAE;AACxD,cAAI,OAAO,EAAE,EAAG;AAChB,gBAAM,QAAS,KAAK,mBAAmB,EAAE,OAAO,cAAc,EAAU,OAAO;AAC/E,cAAI,CAAC,OAAO,KAAK,GAAG;AAClB,kBAAM,SAAU,MAAM,OAAO,sBAAsB,EAAU,OAAO,QAAQ,IAAI,KAAK,mBAAmB,GAAG,gBAAgB,CAAC;AAC5H,gBAAI,CAAC,OAAO,MAAM,EAAG,CAAC,GAAG,OAAO,oBAAoB,EAAU,OAAO,MAAM;AAAA,UAC7E;AACA,UAAC,GAAG,OAAO,WAAW,EAAU,OAAO,GAAG,MAAM,GAAG,CAAC;AACpD,cAAI,oDAAoD;AAAA,QAC1D,SAAS,GAAG;AAAE,cAAI,4CAA4C,CAAC,EAAE;AAAA,QAAG;AAAA,MACtE;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAED,UAAQ,8CAA8C,MAAM;AAC1D,UAAM,MAAM,IAAI,KAAK,iBAAiB;AACtC,gBAAY,OAAO,IAAI,OAAO,UAAU,EAAE,gBAAgB;AAAA,MACxD,QAAQ,MAAM;AAAE,aAAK,OAAO,KAAK,CAAC;AAAA,MAAG;AAAA,MACrC,UAAU;AACR,YAAI;AACF,gBAAM,OAAO,IAAI,OAAO,OAAO,KAAK,IAAI;AACxC,gBAAM,UAAU,KAAK,MAAmC,eAAe,EAAE;AACzE,cAAI,OAAO,OAAO,EAAG;AACrB,cAAI,kBAAwC;AAC5C,cAAI;AAAE,8BAAkB,KAAK,MAAqB,kBAAkB,EAAE;AAAA,UAAO,SAAS,GAAG;AAAA,UAAC;AAC1F,cAAI,OAAO,eAAe,EAAG;AAC7B,gBAAM,YAAY,OAAO,gBAAgB,MAAqB,OAAO,EAAE,OAAO,WAAW,EAAE;AAC3F,cAAI,CAAC,UAAW;AAChB,gBAAM,KAAM,IAAI,KAAK,oBAAoB,EAAE,OAAO,cAAc,EAAU,OAAO;AACjF,cAAI,OAAO,EAAE,EAAG;AAChB,gBAAM,SAAS,GAAG,MAAqB,QAAQ,EAAE,OAAO,MAAqB,QAAQ,EAAE;AAAgB,cAAI,OAAO,MAAM,EAAG;AAC3H,cAAI,QAA8B;AAClC,gBAAM,QAAQ,OAAQ,OAAO,OAAO,WAAW,EAAU,OAAO,CAAC;AACjE,mBAAS,IAAI,GAAG,IAAI,OAAO,KAAK;AAC9B,kBAAM,IAAI,OAAO,OAAO,YAAY,CAAC,EAAE,OAAO,CAAC;AAC/C,gBAAI,OAAO,CAAC,EAAG;AACf,kBAAM,OAAS,EAAE,MAAW,YAAY,EAAE,MAA2B,MAAM,YAAY,EAAE,OAAyB;AAClH,gBAAI,SAAS,WAAW;AAAE,sBAAQ;AAAG;AAAA,YAAO;AAAA,UAC9C;AACA,cAAI,OAAO,KAAK,EAAG;AACnB,gBAAM,SAAS,QAAQ,MAAM,MAAW,QAAQ,EAAE,KAAK;AACvD,cAAI,WAAW,iBAAkB;AACjC,cAAI,oCAAoC,SAAS,EAAE;AACnD,cAAI;AACF,kBAAM,kBAAkB,QAAQ,IAAI,gBAAgB;AACpD,gBAAI,CAAC,OAAO,eAAe,GAAG;AAC5B,oBAAM,KAAK,KAAK,iBAAiB,gBAAgB;AACjD,kBAAI,CAAC,OAAO,EAAE,EAAG,CAAC,GAAG,OAAO,WAAW,EAAU,OAAO,KAAK;AAAA,YAC/D;AAAA,UACF,SAAS,GAAG;AAAA,UAAC;AACb,gBAAM,eAAe,QAAQ,IAAI,CAAC;AAClC,cAAI,CAAC,OAAO,YAAY,GAAG;AACzB,kBAAM,KAAK,KAAK,cAAc,gBAAgB;AAC9C,gBAAI,CAAC,OAAO,EAAE,EAAG,CAAC,GAAG,OAAO,WAAW,EAAU,OAAO,IAAI;AAC5D,YAAC,aAAa,OAAO,WAAW,EAAU,OAAO,GAAG,MAAM,GAAG,CAAC;AAAA,UAChE;AAAA,QACF,SAAS,GAAG;AAAE,cAAI,oCAAoC,CAAC,EAAE;AAAA,QAAG;AAAA,MAC9D;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAKD,UAAQ,4BAA4B,MAAM;AACxC,UAAM,UAAU,IAAI,KAAK,cAAc;AACvC,QAAI,SAAS;AACb,eAAW,KAAK,QAAQ,QAAQ,OAAO,OAAK,EAAE,SAAS,wBAAwB,GAAG;AAChF,kBAAY,OAAO,EAAE,gBAAgB;AAAA,QACnC,QAAQ,MAAM;AAAE,cAAI,SAAS,GAAI,MAAK,OAAO,OAAO,KAAK,CAAC,CAAC;AAAA,QAAG;AAAA,QAC9D,QAAQ,KAAK;AACX,cAAI,UAAU,GAAI;AAClB,gBAAM,OAAO,KAAK,QAAQ;AAC1B,cAAI,KAAK,YAAY,EAAE,QAAQ,cAAc,IAAI,KAAK,CAAC,IAAI,OAAO,EAAG;AACrE;AACA,cAAI,2BAA2B,IAAI,SAAS,IAAI,OAAO,IAAI,gCAAgC,IAAI,EAAE;AAAA,QACnG;AAAA,MACF,CAAC;AAAA,IACH;AAAA,EACF,CAAC;AAOD,UAAQ,sBAAsB,MAAM;AAClC,UAAM,MAAM,IAAI,KAAK,iCAAiC;AACtD,UAAM,UAAU,IAAI,KAAK,cAAc;AACvC,QAAI,WAAW;AACf,gBAAY,OAAO,QAAQ,OAAO,oBAAoB,EAAE,gBAAgB;AAAA,MACtE,UAAU;AACR,YAAI,SAAU;AACd,YAAI;AACF,gBAAM,SAAS,GAAG,eAAe,CAAC;AAClC,gBAAM,WAAW,IAAI,MAAqB,uBAAuB,EAAE;AACnE,cAAI,OAAO,QAAQ,GAAG;AAAE,gBAAI,+CAA+C;AAAG;AAAA,UAAQ;AACtF,qBAAW;AACX,gBAAM,QAAQ,SAAS,OAAO,oBAAoB,EAAE,OAAO;AAC3D,gBAAM,QAAkB,CAAC;AACzB,mBAAS,IAAI,GAAG,IAAI,MAAM,QAAQ,KAAK;AACrC,kBAAM,OAAO,MAAM,IAAI,CAAC,GAAG,WAAW;AACtC,kBAAM,OAAO,SAAS,OAAO,oBAAoB,EAAE,OAAO,OAAO,OAAO,IAAI,CAAC;AAC7E,kBAAM,MAAM,OAAQ,MAAc,OAAO,UAAU,EAAE,OAAO,GAAG,WAAW,EAAE;AAC5E,kBAAM,KAAK,GAAG,IAAI,IAAI,GAAG,EAAE;AAAA,UAC7B;AACA,UAAC,OAAO,OAAO,MAAM,gBAAgB,EAAE,OAAO,cAAc,EACzD,OAAO,OAAO,OAAO,MAAM,GAAG,OAAO,OAAO,MAAM,KAAK,IAAI,CAAC,CAAC;AAChE,cAAI,wBAAwB,MAAM,MAAM,eAAe,MAAM,EAAE;AAAA,QACjE,SAAS,GAAG;AAAE,cAAI,8BAA8B,CAAC,EAAE;AAAA,QAAG;AAAA,MACxD;AAAA,IACF,CAAC;AAAA,EACH,CAAC;AAED,MAAI,gBAAgB;AACtB,CAAC;",
  "names": ["Il2Cpp", "section", "Android", "getter", "obj", "UnityVersion", "a", "b", "Il2Cpp", "_", "module", "parameters", "method", "Array", "array", "delegate", "memorySnapshot", "i", "Object", "field", "String", "value", "req"]
}
