"""A tiny greeting script for the sakthizzz project."""


def greeting(name: str = "world") -> str:
    """Return a friendly greeting for the given name."""
    return f"Hello, {name}! Welcome to sakthizzz."


if __name__ == "__main__":
    print(greeting())
