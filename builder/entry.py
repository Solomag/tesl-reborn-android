if __name__ == "__main__":
    import sys

    if len(sys.argv) == 3 and sys.argv[1] == "--self-test":
        from builder.selftest import run

        run(sys.argv[2])
    else:
        from builder.gui import main

        main()
